/**
 * Bharadwaj Mandir standalone Lead Management automation.
 * Runs as the Apps Script owner and uses SpreadsheetApp directly; no web app,
 * coordinator, service-account key, or AI Review functionality is required.
 */
const LEAD_HEADERS = [
  'Lead ID', 'Submission timestamp', 'Customer name', 'Email', 'Phone', 'Country',
  'Product name or SKU', 'Enquiry message', 'Lead source', 'UTM source', 'UTM medium',
  'UTM campaign', 'UTM term', 'UTM content', 'Lead status', 'Assigned owner', 'Backup owner',
  'Last contacted date', 'Next action', 'Follow-up due date', 'Quote status', 'Outcome',
  'Internal notes', 'Last updated timestamp', 'Netlify Submission ID', 'City',
  'Product interest', 'First human response timestamp', 'Project dimensions', 'Budget',
  'Desired timeline', 'Delivery needs', 'Possible duplicate review', 'Enquiry processing consent', 'Marketing consent',
]
const REPORT_CONTROL_HEADERS = ['Control key', 'Value']
const REPORT_CONTROL_KEYS = ['last_report_end_utc', 'next_report_due_utc', 'pending_report_end_utc', 'pending_report_body']
const LEAD_REGISTER_TAB = 'Lead Register'
const REPORT_CONTROL_TAB = 'Report Control'
const LEAD_LOCK_WAIT_MS = 8000
const FORM_PAGE_SIZE = 100
const MAX_FORM_PAGES = 100
const REPORT_IDEMPOTENCY_PREFIX = 'bharadwaj-lead-report-'
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Needs Details', 'Quote in Progress', 'Quoted', 'Won', 'Lost', 'Nurture']
const PRODUCT_NAMES = {
  'white-marble-mandir': 'White Marble Mandir',
  'peacock-design-mandir': 'Peacock Design Mandir',
  'floral-design-mandir': 'Floral Design Mandir',
  'ornate-traditional-mandir': 'Ornate Traditional Mandir',
}

function leadProperties_() {
  return PropertiesService.getScriptProperties()
}

function requiredLeadProperty_(name) {
  const value = leadProperties_().getProperty(name)
  if (typeof value !== 'string' || !value.trim()) throw new Error('LEAD_CONFIG_' + name)
  return value.trim()
}

function leadSpreadsheet_() {
  return SpreadsheetApp.openById(requiredLeadProperty_('LEAD_SPREADSHEET_ID'))
}

function leadSheets_() {
  const spreadsheet = leadSpreadsheet_()
  const leadRegister = spreadsheet.getSheetByName(LEAD_REGISTER_TAB)
  const reportControl = spreadsheet.getSheetByName(REPORT_CONTROL_TAB)
  if (!leadRegister || !reportControl) throw new Error('LEAD_SHEETS_MISSING')
  if (JSON.stringify(leadRegister.getRange(1, 1, 1, LEAD_HEADERS.length).getDisplayValues()[0]) !== JSON.stringify(LEAD_HEADERS)) {
    throw new Error('LEAD_REGISTER_SCHEMA_MISMATCH')
  }
  const controlRows = reportControl.getRange(1, 1, REPORT_CONTROL_KEYS.length + 1, REPORT_CONTROL_HEADERS.length).getDisplayValues()
  if (JSON.stringify(controlRows[0]) !== JSON.stringify(REPORT_CONTROL_HEADERS)
    || REPORT_CONTROL_KEYS.some(function (key, index) { return controlRows[index + 1][0] !== key })) {
    throw new Error('REPORT_CONTROL_SCHEMA_MISMATCH')
  }
  return { spreadsheet: spreadsheet, leadRegister: leadRegister, reportControl: reportControl }
}

function cleanLeadText_(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength || 4000) : ''
}

function normalizeLeadFieldName_(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findLeadFormField_(data, candidates, maxLength) {
  const keys = Object.keys(data || {})
  for (let index = 0; index < candidates.length; index += 1) {
    const wanted = normalizeLeadFieldName_(candidates[index])
    const key = keys.find(function (candidate) { return normalizeLeadFieldName_(candidate) === wanted })
    if (key && data[key] !== null && data[key] !== '') return cleanLeadText_(String(data[key]), maxLength)
  }
  return ''
}

function normalizeLeadSubmission_(submission, duplicateIds, now) {
  if (!submission || typeof submission !== 'object') throw new Error('INVALID_NETLIFY_SUBMISSION')
  const id = cleanLeadText_(submission.id, 200)
  const data = submission.data
  const createdAt = cleanLeadText_(submission.created_at || submission.createdAt, 80)
  if (!id || !data || typeof data !== 'object' || Array.isArray(data) || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error('INVALID_NETLIFY_SUBMISSION')
  }
  const email = findLeadFormField_(data, ['email', 'email_address'], 254).toLowerCase()
  const name = findLeadFormField_(data, ['fullName', 'name', 'customer_name'], 120) || cleanLeadText_(submission.name, 120)
  if (!email || email.indexOf('@') < 1 || !name) throw new Error('INVALID_NETLIFY_SUBMISSION')
  const productId = findLeadFormField_(data, ['productId', 'product_id'], 120)
  const interest = findLeadFormField_(data, ['interest', 'product_interest'], 200)
  const utmSource = findLeadFormField_(data, ['utm_source'], 250)
  const source = utmSource || findLeadFormField_(data, ['landingPage'], 500)
    || findLeadFormField_(data, ['pageUrl'], 800) || 'Unattributed'
  const duplicate = duplicateIds && duplicateIds.has(id)
  return [
    'BM-' + id, new Date(createdAt), name, email,
    findLeadFormField_(data, ['phone', 'telephone', 'mobile'], 40),
    findLeadFormField_(data, ['country'], 100),
    PRODUCT_NAMES[productId] || productId || interest || 'Custom project',
    findLeadFormField_(data, ['message', 'enquiry', 'inquiry', 'enquiry_message', 'comments'], 4000)
      || cleanLeadText_(submission.body || submission.summary, 4000),
    source, utmSource, findLeadFormField_(data, ['utm_medium'], 250),
    findLeadFormField_(data, ['utm_campaign'], 250), findLeadFormField_(data, ['utm_term'], 250),
    findLeadFormField_(data, ['utm_content'], 250), 'New',
    cleanLeadText_(leadProperties_().getProperty('LEAD_OWNER_NAME'), 120),
    cleanLeadText_(leadProperties_().getProperty('LEAD_BACKUP_OWNER_NAME'), 120),
    '', '', '', 'Not started', '', '', now.toISOString(), id,
    findLeadFormField_(data, ['city'], 100), interest, '',
    findLeadFormField_(data, ['dimensions', 'project_dimensions'], 200),
    findLeadFormField_(data, ['budget'], 100), findLeadFormField_(data, ['timeline', 'desired_timeline'], 100),
    findLeadFormField_(data, ['deliveryNeeds', 'delivery_needs'], 100),
    duplicate ? 'Review: similar submission in reporting window' : '',
    data.privacyAcknowledged === 'yes' ? 'Yes' : 'No', data.marketingConsent === 'yes' ? 'Yes' : 'No',
  ]
}

function leadDuplicateKey_(submission) {
  const data = submission && submission.data || {}
  const email = findLeadFormField_(data, ['email', 'email_address'], 254).toLowerCase()
  const message = findLeadFormField_(data, ['message', 'enquiry', 'inquiry', 'enquiry_message', 'comments'], 4000)
    .toLowerCase().replace(/\s+/g, ' ')
  const interest = findLeadFormField_(data, ['interest', 'product_interest'], 200).toLowerCase()
  return email && (message || interest) ? [email, interest, message].join('|') : ''
}

function possibleLeadDuplicates_(submissions, now) {
  const counts = new Map()
  const start = now.getTime() - 48 * 60 * 60 * 1000
  submissions.forEach(function (submission) {
    const created = Date.parse(submission.created_at || submission.createdAt || '')
    const key = leadDuplicateKey_(submission)
    if (key && Number.isFinite(created) && created >= start && created <= now.getTime()) counts.set(key, (counts.get(key) || 0) + 1)
  })
  return new Set(submissions.filter(function (submission) {
    const created = Date.parse(submission.created_at || submission.createdAt || '')
    const key = leadDuplicateKey_(submission)
    return key && Number.isFinite(created) && created >= start && created <= now.getTime() && counts.get(key) > 1
  }).map(function (submission) { return String(submission.id) }))
}

function fetchNetlifySubmissions_(state) {
  if (state !== 'verified' && state !== 'spam') throw new Error('INVALID_SUBMISSION_STATE')
  const token = requiredLeadProperty_('NETLIFY_ACCESS_TOKEN')
  const formId = encodeURIComponent(requiredLeadProperty_('NETLIFY_FORM_ID'))
  const pages = Number(leadProperties_().getProperty('NETLIFY_SYNC_MAX_PAGES') || MAX_FORM_PAGES)
  if (!Number.isInteger(pages) || pages < 1 || pages > MAX_FORM_PAGES) throw new Error('INVALID_SYNC_PAGE_LIMIT')
  const fetchPage = function (page) {
    const params = 'page=' + page + '&per_page=' + FORM_PAGE_SIZE + (state === 'spam' ? '&state=spam' : '')
    const url = 'https://api.netlify.com/api/v1/forms/' + formId + '/submissions?' + params
    const response = UrlFetchApp.fetch(url, {
      method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
    })
    const status = response.getResponseCode()
    if (status < 200 || status >= 300) {
      Logger.log('Netlify ' + state + ' submissions request failed (HTTP ' + status + ').')
      throw new Error('NETLIFY_' + state.toUpperCase() + '_HTTP_' + status)
    }
    let batch
    try { batch = JSON.parse(response.getContentText()) } catch (_) { throw new Error('NETLIFY_INVALID_JSON') }
    if (!Array.isArray(batch)) throw new Error('NETLIFY_INVALID_RESPONSE')
    return batch
  }
  const submissions = []
  for (let page = 1; page <= pages; page += 1) {
    const batch = fetchPage(page)
    submissions.push.apply(submissions, batch)
    if (batch.length < FORM_PAGE_SIZE) return submissions
    if (page === pages) {
      if (fetchPage(page + 1).length === 0) return submissions
      throw new Error('NETLIFY_PAGE_LIMIT_EXCEEDED')
    }
  }
  return submissions
}

function leadWithLock_(callback) {
  const lock = LockService.getScriptLock()
  lock.waitLock(LEAD_LOCK_WAIT_MS)
  try { return callback() } finally { lock.releaseLock() }
}

function appendNewLeadSubmissions_(submissions, now) {
  const duplicateIds = possibleLeadDuplicates_(submissions, now)
  const rows = submissions.map(function (submission) { return normalizeLeadSubmission_(submission, duplicateIds, now) })
  return leadWithLock_(function () {
    const sheets = leadSheets_()
    const lastRow = sheets.leadRegister.getLastRow()
    const existing = new Set()
    if (lastRow > 1) {
      sheets.leadRegister.getRange(2, 25, lastRow - 1, 1).getDisplayValues().forEach(function (row) {
        if (row[0]) existing.add(String(row[0]))
      })
    }
    const pending = []
    rows.forEach(function (row) {
      const submissionId = row[24]
      if (!submissionId || existing.has(submissionId)) return
      existing.add(submissionId)
      pending.push(row)
    })
    if (!pending.length) return { inserted: 0, alreadyPresent: rows.length }
    const startRow = sheets.leadRegister.getLastRow() + 1
    sheets.leadRegister.getRange(startRow, 1, pending.length, LEAD_HEADERS.length)
      .setValues(pending.map(function (row) { return row.map(function (value) {
        return typeof value === 'string' && value.charAt(0) === '=' ? "'" + value : value
      }) }))
    SpreadsheetApp.flush()
    const persisted = new Set(sheets.leadRegister.getRange(startRow, 25, pending.length, 1).getDisplayValues().map(function (row) { return String(row[0]) }))
    if (pending.some(function (row) { return !persisted.has(row[24]) })) throw new Error('LEAD_REGISTER_WRITE_UNCERTAIN')
    return { inserted: pending.length, alreadyPresent: rows.length - pending.length }
  })
}

/** Manual recovery entry point; safe to run again because the Sheet deduplicates IDs. */
function syncEnquiriesToSheet() {
  const submissions = fetchNetlifySubmissions_('verified')
  const result = appendNewLeadSubmissions_(submissions, new Date())
  Logger.log('Lead sync completed. Inserted: ' + result.inserted + '; already present: ' + result.alreadyPresent + '.')
  return result
}

function readReportControl_(sheet) {
  const rows = sheet.getRange(2, 1, REPORT_CONTROL_KEYS.length, 2).getDisplayValues()
  const control = new Map()
  rows.forEach(function (row, index) {
    if (row[0] !== REPORT_CONTROL_KEYS[index]) throw new Error('REPORT_CONTROL_SCHEMA_MISMATCH')
    control.set(row[0], row[1] || '')
  })
  return control
}

function writeReportControl_(entries) {
  const keys = Object.keys(entries)
  if (keys.some(function (key) { return REPORT_CONTROL_KEYS.indexOf(key) < 0 || typeof entries[key] !== 'string' })) {
    throw new Error('REPORT_CONTROL_UPDATE_INVALID')
  }
  leadWithLock_(function () {
    const sheet = leadSheets_().reportControl
    keys.forEach(function (key) {
      const row = REPORT_CONTROL_KEYS.indexOf(key) + 2
      const value = entries[key]
      sheet.getRange(row, 2).setValue(value.charAt(0) === '=' ? "'" + value : value)
    })
    if (keys.length) SpreadsheetApp.flush()
    const persisted = readReportControl_(sheet)
    if (keys.some(function (key) { return persisted.get(key) !== entries[key] })) throw new Error('REPORT_CONTROL_WRITE_UNCERTAIN')
  })
}

function reportWindow_(now, control) {
  const pendingEnd = Date.parse(control.get('pending_report_end_utc') || '')
  if (Number.isFinite(pendingEnd)) return { start: new Date(pendingEnd - 48 * 3600000), end: new Date(pendingEnd) }
  const due = Date.parse(control.get('next_report_due_utc') || '')
  if (!Number.isFinite(due)) return { initializeDue: new Date(now.getTime() + 48 * 3600000) }
  if (now.getTime() < due) return null
  return { start: new Date(now.getTime() - 48 * 3600000), end: now }
}

function buildLeadReport_(leads, verified, spam, windowStart, windowEnd, now, timeZone) {
  const startMs = windowStart.getTime()
  const endMs = windowEnd.getTime()
  const unique = new Map()
  leads.forEach(function (row) {
    const id = row[24] || row[0]
    if (id && !unique.has(id)) unique.set(id, row)
  })
  const uniqueLeads = Array.from(unique.values())
  const recent = uniqueLeads.filter(function (row) {
    const time = row[1] instanceof Date ? row[1].getTime() : Date.parse(row[1] || '')
    return Number.isFinite(time) && time >= startMs && time < endMs
  })
  const inWindow = function (items) { return items.filter(function (item) {
    const time = Date.parse(item.created_at || item.createdAt || '')
    return Number.isFinite(time) && time >= startMs && time < endMs
  }).length }
  const tally = function (items, value) {
    const counts = new Map()
    items.forEach(function (item) { const key = value(item) || 'Unknown'; counts.set(key, (counts.get(key) || 0) + 1) })
    return Array.from(counts.entries()).sort(function (a, b) { return b[1] - a[1] })
      .map(function (entry) { return '  - ' + entry[0] + ': ' + entry[1] }).join('\n') || '  - Unavailable'
  }
  const pipeline = LEAD_STATUSES.map(function (status) {
    return '  - ' + status + ': ' + uniqueLeads.filter(function (row) { return row[14] === status }).length
  }).join('\n')
  const followupDue = function (row) { return row[19] instanceof Date ? row[19].getTime() : Date.parse(row[19] || '') }
  const overdue = uniqueLeads.filter(function (row) { return Number.isFinite(followupDue(row)) && followupDue(row) < now.getTime() && row[14] !== 'Won' && row[14] !== 'Lost' })
  const upcoming = uniqueLeads.filter(function (row) { return Number.isFinite(followupDue(row)) && followupDue(row) >= now.getTime() && followupDue(row) <= now.getTime() + 7 * 86400000 })
  const customerSources = new Map()
  uniqueLeads.forEach(function (row) {
    const email = cleanLeadText_(row[3], 254).toLowerCase()
    const submitted = row[1] instanceof Date ? row[1].getTime() : Date.parse(row[1] || '')
    if (!email || !Number.isFinite(submitted)) return
    const current = customerSources.get(email)
    if (!current) customerSources.set(email, { firstAt: submitted, first: row[8], latestAt: submitted, latest: row[8] })
    else {
      if (submitted < current.firstAt) { current.firstAt = submitted; current.first = row[8] }
      if (submitted > current.latestAt) { current.latestAt = submitted; current.latest = row[8] }
    }
  })
  const windowCustomers = new Set(recent.map(function (row) { return cleanLeadText_(row[3], 254).toLowerCase() }).filter(Boolean))
  const firstSourceRows = []
  const latestSourceRows = []
  windowCustomers.forEach(function (email) {
    const source = customerSources.get(email)
    if (source) { firstSourceRows.push({ source: source.first }); latestSourceRows.push({ source: source.latest }) }
  })
  const responseMinutes = uniqueLeads.map(function (row) {
    const submitted = row[1] instanceof Date ? row[1].getTime() : Date.parse(row[1] || '')
    const responded = row[27] instanceof Date ? row[27].getTime() : Date.parse(row[27] || '')
    return Number.isFinite(submitted) && submitted >= startMs && submitted < endMs
      && Number.isFinite(responded) && responded >= submitted ? (responded - submitted) / 60000 : null
  }).filter(function (value) { return value !== null }).sort(function (a, b) { return a - b })
  const percentile = function (fraction) { return responseMinutes.length
    ? Math.round(responseMinutes[Math.max(0, Math.ceil(fraction * responseMinutes.length) - 1)]) : null }
  const median = percentile(0.5)
  const p90 = percentile(0.9)
  const format = function (date) { return Utilities.formatDate(date, timeZone, 'dd MMM yyyy HH:mm') }
  const followups = function (rows) { return rows.map(function (row) {
    return '  - ' + row[0] + ' | ' + (row[5] || 'Unknown country') + ' | ' + (row[14] || 'New') + ' | due ' + format(row[19])
  }).join('\n') || '  - None' }
  return [
    'Bharadwaj Mandir lead report (' + format(windowStart) + ' to ' + format(windowEnd) + ' ' + timeZone + ')',
    'Exact reporting window: ' + windowStart.toISOString() + ' to ' + windowEnd.toISOString() + ' (UTC).', '',
    'Unique new enquiries in register: ' + recent.length,
    'Verified Netlify submissions in window: ' + inWindow(verified),
    'Spam submissions in window: ' + inWindow(spam),
    'Possible duplicate submissions flagged for review: ' + recent.filter(function (row) { return Boolean(row[32]) }).length,
    'Qualified new leads: ' + recent.filter(function (row) { return row[14] === 'Qualified' }).length,
    'Median recorded first-human response: ' + (median === null ? 'Unavailable' : median + ' minutes'),
    '90th-percentile recorded first-human response: ' + (p90 === null ? 'Unavailable' : p90 + ' minutes'),
    '', 'By country:', tally(recent, function (row) { return row[5] }),
    '', 'By product interest:', tally(recent, function (row) { return row[26] || row[6] }),
    '', 'By recorded source for enquiries in this window:', tally(recent, function (row) { return row[8] }),
    '', 'First recorded source for customers with an enquiry in this window:', tally(firstSourceRows, function (item) { return item.source }),
    '', 'Latest recorded source for those customers:', tally(latestSourceRows, function (item) { return item.source }),
    '', 'Current pipeline:', pipeline,
    '', 'Follow-ups overdue (' + overdue.length + '):', followups(overdue),
    '', 'Follow-ups due in the next 7 days (' + upcoming.length + '):', followups(upcoming),
    'Won leads (all time in register): ' + uniqueLeads.filter(function (row) { return row[14] === 'Won' || row[21] === 'Won' }).length,
    'Lost leads (all time in register): ' + uniqueLeads.filter(function (row) { return row[14] === 'Lost' || row[21] === 'Lost' }).length,
    'Sessions, analytics conversions and conversion rate: Unavailable (analytics is not connected).',
    'Response-time metrics include only rows with a manually recorded first human response timestamp.',
  ].join('\n')
}

function sendLeadReport_(text, end) {
  const apiKey = requiredLeadProperty_('RESEND_API_KEY')
  const from = requiredLeadProperty_('REPORT_FROM_EMAIL')
  const to = requiredLeadProperty_('REPORT_TO_EMAIL')
  const response = UrlFetchApp.fetch('https://api.resend.com/emails', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + apiKey, 'Idempotency-Key': REPORT_IDEMPOTENCY_PREFIX + end.getTime() },
    payload: JSON.stringify({
      from: from, to: [to], subject: 'Bharadwaj Mandir lead report — ' + end.toISOString(), text: text,
    }),
  })
  const status = response.getResponseCode()
  if (status < 200 || status >= 300) throw new Error('REPORT_EMAIL_HTTP_' + status)
  return true
}

function runDueLeadReport_(verified, spam, now) {
  const sheets = leadSheets_()
  const control = readReportControl_(sheets.reportControl)
  const window = reportWindow_(now, control)
  if (window && window.initializeDue) {
    writeReportControl_({ next_report_due_utc: window.initializeDue.toISOString() })
    return 'REPORT_SCHEDULED'
  }
  if (!window) return 'REPORT_NOT_DUE'
  const endText = window.end.toISOString()
  if (!control.get('pending_report_end_utc')) writeReportControl_({ pending_report_end_utc: endText })
  let body = control.get('pending_report_body') || ''
  if (!body) {
    const currentRows = sheets.leadRegister.getLastRow() > 1
      ? sheets.leadRegister.getRange(2, 1, sheets.leadRegister.getLastRow() - 1, LEAD_HEADERS.length).getValues() : []
    body = buildLeadReport_(currentRows, verified, spam, window.start, window.end, window.end,
      leadProperties_().getProperty('REPORT_TIMEZONE') || 'Asia/Kolkata')
    writeReportControl_({ pending_report_body: body })
  }
  if (now.getTime() - window.end.getTime() > 23 * 3600000) throw new Error('PENDING_REPORT_EXPIRED')
  sendLeadReport_(body + '\n\nDisplay timezone: ' + (leadProperties_().getProperty('REPORT_TIMEZONE') || 'Asia/Kolkata') + '.', window.end)
  writeReportControl_({
    last_report_end_utc: endText,
    next_report_due_utc: new Date(window.end.getTime() + 48 * 3600000).toISOString(),
    pending_report_end_utc: '', pending_report_body: '',
  })
  return 'REPORT_SENT'
}

/** Netlify Forms sync and 48-hour report check. Safe to invoke on each hourly trigger. */
function runLeadOperationsHourly() {
  const now = new Date()
  const verified = fetchNetlifySubmissions_('verified')
  const spam = fetchNetlifySubmissions_('spam')
  const sync = appendNewLeadSubmissions_(verified, now)
  const reportState = runDueLeadReport_(verified, spam, now)
  Logger.log('Hourly Lead Operations completed. Inserted: ' + sync.inserted + '; already present: ' + sync.alreadyPresent + '; report: ' + reportState + '.')
}

/** Installs the hourly trigger once. Report timing remains governed by Report Control. */
function setupHourlyLeadOperationsTrigger() {
  const existing = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'runLeadOperationsHourly'
  })
  if (!existing) ScriptApp.newTrigger('runLeadOperationsHourly').timeBased().everyHours(1).create()
  return existing ? 'Hourly Lead Operations trigger already exists.' : 'Hourly Lead Operations trigger created.'
}
