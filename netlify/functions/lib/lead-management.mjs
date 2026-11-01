import { createHmac, createSign, randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'

export const LEAD_OPERATIONS_COORDINATOR_TIMEOUT_MS = 15_000
export const LEAD_REGISTER_PAGE_SIZE = 100
export const APPS_SCRIPT_REQUEST_LIMIT = 40_000
export class CoordinatorUnavailableError extends Error {
  constructor(message, { failurePhase = 'response-validation', httpStatus } = {}) {
    super(message)
    this.failurePhase = failurePhase
    this.httpStatus = httpStatus
  }
}

/** Creates the authenticated client for the Apps Script serialization boundary. */
export function createLeadOperationsCoordinator({
  url = process.env.AI_REVIEW_COORDINATOR_URL,
  secret = process.env.AI_REVIEW_COORDINATOR_SECRET,
  fetchImpl = fetch,
  now = () => Date.now(),
  nonce = () => randomBytes(24).toString('hex'),
  requestTimeoutMs = LEAD_OPERATIONS_COORDINATOR_TIMEOUT_MS,
} = {}) {
  const request = async (payload) => {
    const operation = typeof payload?.operation === 'string' ? payload.operation : 'unknown'
    if (typeof url !== 'string' || !url.startsWith('https://') || typeof secret !== 'string' || secret.length < 32) {
      throw new CoordinatorUnavailableError('Apps Script coordinator is not configured.', { failurePhase: 'configuration' })
    }
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new CoordinatorUnavailableError('Apps Script coordinator timeout configuration is invalid.', { failurePhase: 'configuration' })
    }
    const timestamp = new Date(now()).toISOString()
    const requestNonce = nonce()
    const serializedPayload = JSON.stringify(payload)
    const canonical = `${timestamp}.${requestNonce}.${serializedPayload}`
    const signature = createHmac('sha256', secret).update(canonical).digest('base64url')
    const requestBody = JSON.stringify({ timestamp, nonce: requestNonce, signature, payload })
    if (requestBody.length > APPS_SCRIPT_REQUEST_LIMIT) {
      throw new CoordinatorUnavailableError('Coordinator request exceeds the supported size limit.', { failurePhase: 'request-validation' })
    }
    let response
    const signal = AbortSignal.timeout(requestTimeoutMs)
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody,
        signal,
      })
    } catch (error) {
      const timedOut = signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError'
      throw new CoordinatorUnavailableError(
        timedOut ? 'Apps Script coordinator request timed out.' : 'Apps Script coordinator request failed.',
        { failurePhase: timedOut ? 'timeout' : 'transport' },
      )
    }
    if (!response.ok) throw new CoordinatorUnavailableError('Apps Script coordinator is unavailable.', {
      failurePhase: 'http', httpStatus: Number.isInteger(response.status) ? response.status : undefined,
    })
    let body
    try { body = await response.json() } catch {
      throw new CoordinatorUnavailableError('Apps Script coordinator returned invalid JSON.', { failurePhase: 'invalid-json' })
    }
    if (body && body.ok === false) {
      const safeErrorCodes = ['INVALID_REQUEST', 'UNAUTHORIZED', 'REPLAYED_REQUEST', 'COORDINATOR_FAILURE']
      const coordinatorError = safeErrorCodes.includes(body.error) ? body.error : 'UNEXPECTED_RESPONSE'
      throw new CoordinatorUnavailableError(
        `Apps Script coordinator rejected ${operation} (${coordinatorError}).`,
        { failurePhase: 'coordinator-response' },
      )
    }
    if (!body || body.ok !== true || !body.result || typeof body.result !== 'object') {
      throw new CoordinatorUnavailableError(
        `Apps Script coordinator response validation failed for ${operation}.`,
        { failurePhase: 'response-validation' },
      )
    }
    return body.result
  }
  const readLeadRegister = async () => {
    const rows = []
    let offset = 0
    let snapshotLastRow = null
    while (true) {
      const result = await request({
        operation: 'leadReadRegister', offset, limit: LEAD_REGISTER_PAGE_SIZE, snapshotLastRow,
      })
      if (!result || result.accepted !== true || !Number.isSafeInteger(result.snapshotLastRow)
        || result.snapshotLastRow < 1 || result.offset !== offset || !Number.isSafeInteger(result.nextOffset)
        || result.nextOffset < offset || result.nextOffset > Math.max(0, result.snapshotLastRow - 1)
        || typeof result.done !== 'boolean' || !Array.isArray(result.rows)
        || result.rows.some((row) => !Array.isArray(row) || row.length !== leadHeaders.length
          || row.some((value) => typeof value !== 'string'))) {
        throw new CoordinatorUnavailableError('Lead Register response is invalid.', { failurePhase: 'response-validation' })
      }
      if (snapshotLastRow === null) snapshotLastRow = result.snapshotLastRow
      else if (result.snapshotLastRow !== snapshotLastRow) {
        throw new CoordinatorUnavailableError('Lead Register page snapshot changed.', { failurePhase: 'response-validation' })
      }
      rows.push(...result.rows)
      if (result.done) {
        if (result.nextOffset !== Math.max(0, snapshotLastRow - 1)) {
          throw new CoordinatorUnavailableError('Lead Register pagination ended early.', { failurePhase: 'response-validation' })
        }
        return rows
      }
      if (result.nextOffset === offset) {
        throw new CoordinatorUnavailableError('Lead Register pagination did not advance.', { failurePhase: 'response-validation' })
      }
      offset = result.nextOffset
    }
  }

  const requestEnvelopeLength = (payload) => JSON.stringify({
    timestamp: '2000-01-01T00:00:00.000Z', nonce: '0'.repeat(48), signature: '0'.repeat(43), payload,
  }).length

  const appendLeadRows = async (rows) => {
    if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row) || row.length !== leadHeaders.length
      || row.some((value) => typeof value !== 'string') || !row[24] || row[24].length > 200)) {
      throw new CoordinatorUnavailableError('Lead Register append request is invalid.', { failurePhase: 'request-validation' })
    }
    if (!rows.length) return { inserted: 0, alreadyPresent: 0 }
    let inserted = 0
    let alreadyPresent = 0
    const appendBatch = async (batch) => {
      const rowsGzip = gzipSync(Buffer.from(JSON.stringify(batch), 'utf8')).toString('base64')
      const payload = { operation: 'leadAppend', rows_gzip: rowsGzip }
      if (batch.length > 1000 || requestEnvelopeLength(payload) > APPS_SCRIPT_REQUEST_LIMIT) {
        if (batch.length <= 1) {
          throw new CoordinatorUnavailableError('A Lead Register row exceeds the supported request size.', { failurePhase: 'request-validation' })
        }
        const midpoint = Math.ceil(batch.length / 2)
        await appendBatch(batch.slice(0, midpoint))
        await appendBatch(batch.slice(midpoint))
        return
      }
      const result = await request(payload)
      if (!result || result.accepted !== true || !Number.isSafeInteger(result.inserted) || result.inserted < 0
        || !Number.isSafeInteger(result.alreadyPresent) || result.alreadyPresent < 0
        || result.inserted + result.alreadyPresent !== batch.length) {
        throw new CoordinatorUnavailableError('Lead Register append response is invalid.', { failurePhase: 'response-validation' })
      }
      inserted += result.inserted
      alreadyPresent += result.alreadyPresent
    }
    for (let offset = 0; offset < rows.length; offset += 1000) {
      await appendBatch(rows.slice(offset, offset + 1000))
    }
    return { inserted, alreadyPresent }
  }

  const readLeadReportControl = async () => {
    const result = await request({ operation: 'leadReadReportControl' })
    const keys = ['last_report_end_utc', 'next_report_due_utc', 'pending_report_end_utc', 'pending_report_body']
    if (!result || result.accepted !== true || !result.entries || typeof result.entries !== 'object'
      || Array.isArray(result.entries) || Object.keys(result.entries).some((key) => !keys.includes(key))
      || keys.some((key) => typeof result.entries[key] !== 'string')) {
      throw new CoordinatorUnavailableError('Report Control response is invalid.', { failurePhase: 'response-validation' })
    }
    return new Map(keys.map((key) => [key, result.entries[key]]))
  }

  const writeLeadReportControl = async (entries) => {
    const keys = ['last_report_end_utc', 'next_report_due_utc', 'pending_report_end_utc', 'pending_report_body']
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)
      || Object.getPrototypeOf(entries) !== Object.prototype && Object.getPrototypeOf(entries) !== null
      || Object.keys(entries).some((key) => !keys.includes(key) || typeof entries[key] !== 'string')) {
      throw new CoordinatorUnavailableError('Report Control update is invalid.', { failurePhase: 'request-validation' })
    }
    let wireEntries = entries
    if (requestEnvelopeLength({ operation: 'leadWriteReportControl', entries }) > APPS_SCRIPT_REQUEST_LIMIT) {
      if (typeof entries.pending_report_body !== 'string') {
        throw new CoordinatorUnavailableError('Report Control update exceeds the supported request size.', { failurePhase: 'request-validation' })
      }
      wireEntries = { ...entries, pending_report_body_gzip: gzipSync(Buffer.from(entries.pending_report_body, 'utf8')).toString('base64') }
      delete wireEntries.pending_report_body
      if (requestEnvelopeLength({ operation: 'leadWriteReportControl', entries: wireEntries }) > APPS_SCRIPT_REQUEST_LIMIT) {
        throw new CoordinatorUnavailableError('Report Control body exceeds the supported request size.', { failurePhase: 'request-validation' })
      }
    }
    const result = await request({ operation: 'leadWriteReportControl', entries: wireEntries })
    if (!result || result.accepted !== true || !Number.isSafeInteger(result.updated)
      || result.updated !== Object.keys(entries).length) {
      throw new CoordinatorUnavailableError('Report Control update response is invalid.', { failurePhase: 'response-validation' })
    }
    return result
  }

  return {
    requestTimeoutMs,
    readLeadRegister,
    appendLeadRows,
    readLeadReportControl,
    writeLeadReportControl,
  }
}

export const leadStatuses = ['New', 'Contacted', 'Qualified', 'Needs Details', 'Quote in Progress', 'Quoted', 'Won', 'Lost', 'Nurture']
export const quoteStatuses = ['Not started', 'In progress', 'Sent', 'Accepted', 'Declined', 'Not applicable']

export const leadHeaders = [
  'Lead ID', 'Submission timestamp', 'Customer name', 'Email', 'Phone', 'Country',
  'Product name or SKU', 'Enquiry message', 'Lead source', 'UTM source', 'UTM medium',
  'UTM campaign', 'UTM term', 'UTM content', 'Lead status', 'Assigned owner', 'Backup owner',
  'Last contacted date', 'Next action', 'Follow-up due date', 'Quote status', 'Outcome',
  'Internal notes', 'Last updated timestamp', 'Netlify Submission ID', 'City',
  'Product interest', 'First human response timestamp', 'Project dimensions', 'Budget',
  'Desired timeline', 'Delivery needs', 'Possible duplicate review', 'Enquiry processing consent', 'Marketing consent',
]

const productNames = {
  'white-marble-mandir': 'White Marble Mandir',
  'peacock-design-mandir': 'Peacock Design Mandir',
  'floral-design-mandir': 'Floral Design Mandir',
  'ornate-traditional-mandir': 'Ornate Traditional Mandir',
}

let tokenCache

export function cleanText(value, maxLength = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function normalizeLead(submission, { possibleDuplicate = false, now = new Date() } = {}) {
  if (!submission || typeof submission !== 'object') throw new Error('Invalid Netlify submission record.')
  const id = cleanText(submission.id, 200)
  const data = submission.data
  if (!id || !data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Netlify submission is missing its ID or form data.')
  const email = cleanText(data.email, 254).toLowerCase()
  const name = cleanText(data.fullName, 120)
  const timestamp = cleanText(submission.created_at || submission.createdAt, 80)
  if (!email || !email.includes('@') || !name || !Number.isFinite(Date.parse(timestamp))) throw new Error('Netlify submission failed lead field validation.')
  const productId = cleanText(data.productId, 120)
  const utmSource = cleanText(data.utm_source, 250)
  const source = utmSource || cleanText(data.landingPage, 500) || cleanText(data.pageUrl, 800) || 'Unattributed'
  return [
    `BM-${id}`, timestamp, name, email, cleanText(data.phone, 40), cleanText(data.country, 100),
    productNames[productId] || productId || cleanText(data.interest, 200) || 'Custom project',
    cleanText(data.message), source, utmSource, cleanText(data.utm_medium, 250),
    cleanText(data.utm_campaign, 250), cleanText(data.utm_term, 250), cleanText(data.utm_content, 250),
    'New', cleanText(process.env.LEAD_OWNER_NAME, 120), cleanText(process.env.LEAD_BACKUP_OWNER_NAME, 120), '', '', '', 'Not started', '', '', now.toISOString(), id,
    cleanText(data.city, 100), cleanText(data.interest, 200), '', cleanText(data.dimensions, 200),
    cleanText(data.budget, 100), cleanText(data.timeline, 100), cleanText(data.deliveryNeeds, 100),
    possibleDuplicate ? 'Review: similar submission in reporting window' : '',
    data.privacyAcknowledged === 'yes' ? 'Yes' : 'No', data.marketingConsent === 'yes' ? 'Yes' : 'No',
  ]
}

export function duplicateKey(submission) {
  const data = submission?.data || {}
  const email = cleanText(data.email, 254).toLowerCase()
  const message = cleanText(data.message).toLowerCase().replace(/\s+/g, ' ')
  const interest = cleanText(data.interest, 200).toLowerCase()
  if (!email || (!message && !interest)) return ''
  return [email, interest, message].join('|')
}

export function flagPossibleDuplicates(submissions) {
  const counts = new Map()
  for (const submission of submissions) {
    const key = duplicateKey(submission)
    if (key) counts.set(key, (counts.get(key) || 0) + 1)
  }
  return new Set(submissions.filter((submission) => {
    const key = duplicateKey(submission)
    return key && counts.get(key) > 1
  }).map((submission) => submission.id))
}

export function percentile(values, fraction) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]
}

export function selectUnseenLeadRows(rows, existingRows) {
  const idColumn = leadHeaders.indexOf('Netlify Submission ID')
  const seen = new Set(existingRows.map((row) => row[idColumn]).filter(Boolean))
  const pending = []
  for (const row of rows) {
    const id = row[idColumn]
    if (!id || seen.has(id)) continue
    seen.add(id)
    pending.push(row)
  }
  return pending
}

function dateValue(value) {
  const time = Date.parse(value || '')
  return Number.isFinite(time) ? time : null
}

function addCount(map, key) {
  const label = cleanText(key, 200) || 'Unknown'
  map.set(label, (map.get(label) || 0) + 1)
}

function countInWindow(submissions, start, end) {
  return submissions.filter((submission) => {
    const created = dateValue(submission.created_at || submission.createdAt)
    return created !== null && created >= start && created < end
  })
}

export function buildLeadReport({ leads, verified, spam, windowStart, windowEnd, now = new Date() }) {
  const start = Date.parse(windowStart)
  const end = Date.parse(windowEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Invalid reporting window.')
  const unique = new Map()
  for (const row of leads) {
    const id = row[24] || row[0]
    if (id && !unique.has(id)) unique.set(id, row)
  }
  const uniqueLeads = [...unique.values()]
  const newLeads = uniqueLeads.filter((row) => {
    const submitted = dateValue(row[1])
    return submitted !== null && submitted >= start && submitted < end
  })
  const newSubmissions = countInWindow(verified, start, end)
  const spamSubmissions = countInWindow(spam, start, end)
  const countryCounts = new Map()
  const interestCounts = new Map()
  const sourceCounts = new Map()
  for (const row of newLeads) {
    addCount(countryCounts, row[5])
    addCount(interestCounts, row[26] || row[6])
    addCount(sourceCounts, row[8])
  }
  const customerSources = new Map()
  for (const row of uniqueLeads) {
    const email = cleanText(row[3], 254).toLowerCase()
    const submitted = dateValue(row[1])
    if (!email || submitted === null) continue
    const existing = customerSources.get(email)
    if (!existing) customerSources.set(email, { firstTime: submitted, first: row[8], latestTime: submitted, latest: row[8] })
    else {
      if (submitted < existing.firstTime) { existing.firstTime = submitted; existing.first = row[8] }
      if (submitted > existing.latestTime) { existing.latestTime = submitted; existing.latest = row[8] }
    }
  }
  const windowCustomers = new Set(newLeads.map((row) => cleanText(row[3], 254).toLowerCase()).filter(Boolean))
  const firstSourceCounts = new Map()
  const latestSourceCounts = new Map()
  for (const email of windowCustomers) {
    const sources = customerSources.get(email)
    if (sources) {
      addCount(firstSourceCounts, sources.first)
      addCount(latestSourceCounts, sources.latest)
    }
  }
  const qualified = newLeads.filter((row) => row[14] === 'Qualified')
  const duplicateCount = newLeads.filter((row) => Boolean(row[32])).length
  const responseMinutes = uniqueLeads.flatMap((row) => {
    const submitted = dateValue(row[1])
    const responded = dateValue(row[27])
    return submitted !== null && submitted >= start && submitted < end && responded !== null && responded >= submitted ? [(responded - submitted) / 60000] : []
  })
  const pipeline = new Map(leadStatuses.map((status) => [status, 0]))
  for (const row of uniqueLeads) if (pipeline.has(row[14])) pipeline.set(row[14], pipeline.get(row[14]) + 1)
  const dueRows = uniqueLeads.filter((row) => {
    const due = dateValue(row[19])
    return due !== null && row[14] !== 'Won' && row[14] !== 'Lost'
  })
  const nowTime = now.getTime()
  const overdue = dueRows.filter((row) => dateValue(row[19]) < nowTime)
  const upcoming = dueRows.filter((row) => dateValue(row[19]) >= nowTime && dateValue(row[19]) <= nowTime + 7 * 86400000)
  const won = uniqueLeads.filter((row) => row[14] === 'Won' || row[21] === 'Won').length
  const lost = uniqueLeads.filter((row) => row[14] === 'Lost' || row[21] === 'Lost').length
  const median = percentile(responseMinutes, 0.5)
  const p90 = percentile(responseMinutes, 0.9)
  const groupText = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => `  - ${key}: ${count}`).join('\n') || '  - Unavailable'
  const reportZone = process.env.REPORT_TIMEZONE || 'Asia/Kolkata'
  const formatInZone = (value) => new Intl.DateTimeFormat('en-IN', { timeZone: reportZone, dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(value))
  const followupText = (rows) => rows.map((row) => `  - ${row[0]} | ${row[5] || 'Unknown country'} | ${row[14] || 'New'} | due ${row[19]}`).join('\n') || '  - None'
  return [
    `Bharadwaj Mandir lead report (${formatInZone(windowStart)} to ${formatInZone(windowEnd)} ${reportZone})`,
    `Exact reporting window: ${windowStart} to ${windowEnd} (UTC).`,
    '',
    `Unique new enquiries in register: ${newLeads.length}`,
    `Verified Netlify submissions in window: ${newSubmissions.length}`,
    `Spam submissions in window: ${spamSubmissions.length}`,
    `Possible duplicate submissions flagged for review: ${duplicateCount}`,
    `Qualified new leads: ${qualified.length}`,
    `Median recorded first-human response: ${median === null ? 'Unavailable' : `${Math.round(median)} minutes`}`,
    `90th-percentile recorded first-human response: ${p90 === null ? 'Unavailable' : `${Math.round(p90)} minutes`}`,
    '', 'By country:', groupText(countryCounts), '', 'By product interest:', groupText(interestCounts), '',
    'By recorded source for enquiries in this window:', groupText(sourceCounts),
    '', 'First recorded source for customers with an enquiry in this window:', groupText(firstSourceCounts),
    '', 'Latest recorded source for those customers:', groupText(latestSourceCounts), '', 'Current pipeline:',
    [...pipeline].map(([status, count]) => `  - ${status}: ${count}`).join('\n'),
    '', `Follow-ups overdue (${overdue.length}):`, followupText(overdue),
    '', `Follow-ups due in the next 7 days (${upcoming.length}):`, followupText(upcoming),
    `Won leads (all time in register): ${won}`, `Lost leads (all time in register): ${lost}`,
    'Sessions, analytics conversions and conversion rate: Unavailable (analytics is not connected).',
    'Response-time metrics include only rows with a manually recorded first human response timestamp.',
  ].join('\n')
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required server configuration: ${name}`)
  return value
}

async function getGoogleAccessToken(fetchImpl = fetch) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) return tokenCache.value
  const email = requiredEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const privateKey = requiredEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({
    iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }))}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const assertion = `${unsigned}.${signer.sign(privateKey, 'base64url')}`
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!response.ok) throw new Error(`Google authentication failed (HTTP ${response.status}).`)
  const token = await response.json()
  tokenCache = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 }
  return tokenCache.value
}

async function googleRequest(path, options = {}) {
  const token = await getGoogleAccessToken()
  const spreadsheetId = encodeURIComponent(requiredEnv('GOOGLE_SPREADSHEET_ID'))
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/${path}`, {
    ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...options.headers },
  })
  if (!response.ok) throw new Error(`Google Sheets API failed (HTTP ${response.status}).`)
  return response.status === 204 ? null : response.json()
}

function leadOperationsCoordinator(coordinator) {
  return coordinator || createLeadOperationsCoordinator({ requestTimeoutMs: LEAD_OPERATIONS_COORDINATOR_TIMEOUT_MS })
}
export async function readLeadRegister(coordinator) {
  return leadOperationsCoordinator(coordinator).readLeadRegister()
}

export async function appendNewLeads(rows, coordinator) {
  const pending = selectUnseenLeadRows(rows, [])
  if (!pending.length) return 0
  const result = await leadOperationsCoordinator(coordinator).appendLeadRows(pending)
  return result.inserted
}

export async function setupLeadSheets({ fetchImpl = fetch } = {}) {
  const token = await getGoogleAccessToken(fetchImpl)
  const spreadsheetId = encodeURIComponent(requiredEnv('GOOGLE_SPREADSHEET_ID'))
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const metadataResponse = await fetchImpl(`${base}?fields=sheets.properties(sheetId,title)`, { headers, signal: AbortSignal.timeout(12000) })
  if (!metadataResponse.ok) throw new Error(`Google spreadsheet lookup failed (HTTP ${metadataResponse.status}).`)
  const metadata = await metadataResponse.json()
  const titles = new Set((metadata.sheets || []).map((sheet) => sheet.properties.title))
  const leadTab = process.env.GOOGLE_SHEET_TAB || 'Lead Register'
  const controlTab = process.env.GOOGLE_CONTROL_TAB || 'Report Control'
  const addRequests = [leadTab, controlTab]
    .filter((title) => !titles.has(title)).map((title) => ({ addSheet: { properties: { title } } }))
  if (addRequests.length) {
    const response = await fetchImpl(`${base}:batchUpdate`, { method: 'POST', headers, body: JSON.stringify({ requests: addRequests }), signal: AbortSignal.timeout(12000) })
    if (!response.ok) throw new Error(`Google sheet tab creation failed (HTTP ${response.status}).`)
  }
  const refreshed = await fetchImpl(`${base}?fields=sheets.properties(sheetId,title)`, { headers, signal: AbortSignal.timeout(12000) })
  if (!refreshed.ok) throw new Error(`Google spreadsheet lookup failed (HTTP ${refreshed.status}).`)
  const sheets = (await refreshed.json()).sheets || []
  const leadSheetId = sheets.find((sheet) => sheet.properties.title === leadTab)?.properties.sheetId
  if (leadSheetId === undefined) throw new Error('Lead Register tab could not be initialized.')
  const setValues = async (range, values) => {
    const encodedRange = encodeURIComponent(range)
    const result = await fetchImpl(`${base}/values/${encodedRange}?valueInputOption=RAW`, {
      method: 'PUT', headers, body: JSON.stringify({ values }), signal: AbortSignal.timeout(12000),
    })
    if (!result.ok) throw new Error(`Google sheet header setup failed (HTTP ${result.status}).`)
  }
  await setValues(`'${leadTab.replace(/'/g, "''")}'!A1:AI1`, [leadHeaders])
  await setValues(`'${controlTab.replace(/'/g, "''")}'!A1:A5`, [
    ['Control key'], ['last_report_end_utc'], ['next_report_due_utc'], ['pending_report_end_utc'], ['pending_report_body'],
  ])
  if (!titles.has(controlTab)) await setValues(`'${controlTab.replace(/'/g, "''")}'!B1:B5`, [['Value'], [''], [''], [''], ['']])
  const statusIndex = leadHeaders.indexOf('Lead status')
  const quoteIndex = leadHeaders.indexOf('Quote status')
  const outcomeIndex = leadHeaders.indexOf('Outcome')
  const validations = [
    { column: statusIndex, values: leadStatuses },
    { column: quoteIndex, values: quoteStatuses },
    { column: outcomeIndex, values: ['Won', 'Lost', 'No decision', 'Not applicable'] },
  ].map(({ column, values }) => ({ repeatCell: {
    range: { sheetId: leadSheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: column, endColumnIndex: column + 1 },
    cell: { dataValidation: { condition: { type: 'ONE_OF_LIST', values: values.map((userEnteredValue) => ({ userEnteredValue })) }, strict: true, showCustomUi: true } },
    fields: 'dataValidation',
  } }))
  const ownerChoices = cleanText(process.env.LEAD_OWNER_OPTIONS, 1000).split(',').map((name) => name.trim()).filter(Boolean)
  const backupChoices = cleanText(process.env.LEAD_BACKUP_OWNER_OPTIONS, 1000).split(',').map((name) => name.trim()).filter(Boolean)
  for (const [header, values] of [['Assigned owner', ownerChoices], ['Backup owner', backupChoices]]) {
    if (!values.length) continue
    const column = leadHeaders.indexOf(header)
    validations.push({ repeatCell: {
      range: { sheetId: leadSheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: column, endColumnIndex: column + 1 },
      cell: { dataValidation: { condition: { type: 'ONE_OF_LIST', values: values.map((userEnteredValue) => ({ userEnteredValue })) }, strict: true, showCustomUi: true } },
      fields: 'dataValidation',
    } })
  }
  for (const header of ['Last contacted date', 'Follow-up due date', 'First human response timestamp']) {
    const column = leadHeaders.indexOf(header)
    validations.push({ repeatCell: {
      range: { sheetId: leadSheetId, startRowIndex: 1, endRowIndex: 5000, startColumnIndex: column, endColumnIndex: column + 1 },
      cell: { dataValidation: { condition: { type: 'DATE_IS_VALID' }, strict: false, showCustomUi: true } },
      fields: 'dataValidation',
    } })
  }
  validations.push({ updateSheetProperties: {
    properties: { sheetId: leadSheetId, gridProperties: { frozenRowCount: 1, rowCount: 5000 } },
    fields: 'gridProperties.frozenRowCount,gridProperties.rowCount',
  } })
  const validationResponse = await fetchImpl(`${base}:batchUpdate`, { method: 'POST', headers, body: JSON.stringify({ requests: validations }), signal: AbortSignal.timeout(12000) })
  if (!validationResponse.ok) throw new Error(`Google sheet validation setup failed (HTTP ${validationResponse.status}).`)
  return { leadTab, controlTab }
}

export async function readReportControl(coordinator) {
  return leadOperationsCoordinator(coordinator).readLeadReportControl()
}

export async function writeReportControl(entries, coordinator) {
  return leadOperationsCoordinator(coordinator).writeLeadReportControl(entries)
}

export async function fetchNetlifySubmissions({
  state = 'verified', fetchImpl = fetch, deadlineAtMs, requestTimeoutMs = 12000,
  minimumRemainingMs = 0, nowMs = () => Date.now(), returnMetadata = false, logger = console,
} = {}) {
  if (state !== 'verified' && state !== 'spam') throw new TypeError('Submission state must be verified or spam.')
  const token = requiredEnv('NETLIFY_ACCESS_TOKEN')
  const formId = requiredEnv('NETLIFY_FORM_ID')
  const pageSize = 100
  const maxPages = Number(process.env.NETLIFY_SYNC_MAX_PAGES || 100)
  const submissions = []
  let truncated = false
  const finish = () => returnMetadata ? { submissions, complete: !truncated, truncated } : submissions
  const fetchPage = async (page) => {
    const remaining = deadlineAtMs === undefined ? Infinity : deadlineAtMs - nowMs()
    if (remaining <= minimumRemainingMs) {
      truncated = true
      return null
    }
    const timeoutMs = Math.max(1, Math.floor(Math.min(requestTimeoutMs, remaining - minimumRemainingMs)))
    const params = new URLSearchParams({ page: String(page), per_page: String(pageSize) })
    if (state === 'spam') params.set('state', 'spam')
    let timer
    let current
    try {
      current = await Promise.race([
        Promise.resolve().then(async () => {
          const response = await fetchImpl(`https://api.netlify.com/api/v1/forms/${encodeURIComponent(formId)}/submissions?${params}`, {
            headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs),
          })
          if (!response.ok) {
            // State and status are sufficient to identify which list failed. Never
            // log the URL, authorization header, response body, or submission data.
            logger.error(`Netlify ${state} submissions request failed (HTTP ${response.status}).`)
            throw new Error(`Netlify ${state} submissions API failed (HTTP ${response.status}).`)
          }
          return response.json()
        }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('NETLIFY_REQUEST_TIMEOUT')), timeoutMs) }),
      ])
    } finally { clearTimeout(timer) }
    if (!Array.isArray(current)) throw new Error('Netlify submissions API returned an invalid response.')
    return current
  }
  for (let page = 1; page <= maxPages; page += 1) {
    const current = await fetchPage(page)
    if (current === null) return finish()
    submissions.push(...current)
    if (current.length < pageSize) return finish()
    if (page === maxPages) {
      if (deadlineAtMs !== undefined || returnMetadata) {
        truncated = true
        throw new Error('Netlify reconciliation exceeded NETLIFY_SYNC_MAX_PAGES; increase the configured limit or archive old submissions.')
      }
      if ((await fetchPage(page + 1)).length === 0) return finish()
    }
  }
  throw new Error('Netlify reconciliation exceeded NETLIFY_SYNC_MAX_PAGES; increase the configured limit or archive old submissions.')
}

export function describeSource(data = {}) {
  return cleanText(data.utm_source, 250) || cleanText(data.landingPage, 500) || cleanText(data.pageUrl, 800) || 'Unattributed'
}

export function createReportWindow(now, control) {
  const existingPending = Date.parse(control.get('pending_report_end_utc') || '')
  if (Number.isFinite(existingPending)) return { start: new Date(existingPending - 48 * 3600000).toISOString(), end: new Date(existingPending).toISOString() }
  const due = Date.parse(control.get('next_report_due_utc') || '')
  if (!Number.isFinite(due)) {
    return { initializeDue: new Date(now.getTime() + 48 * 3600000).toISOString() }
  }
  if (now.getTime() < due && !control.get('pending_report_end_utc')) return null
  const end = now.getTime()
  return { start: new Date(end - 48 * 3600000).toISOString(), end: new Date(end).toISOString() }
}

export async function sendReportEmail({ text, end, fetchImpl = fetch }) {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${requiredEnv('RESEND_API_KEY')}`,
      'content-type': 'application/json',
      'Idempotency-Key': `bharadwaj-lead-report-${Date.parse(end)}`,
    },
    body: JSON.stringify({
      from: requiredEnv('REPORT_FROM_EMAIL'),
      to: [requiredEnv('REPORT_TO_EMAIL')],
      subject: `Bharadwaj Mandir lead report — ${end}`,
      text,
    }),
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`Report email provider failed (HTTP ${response.status}).`)
  return response.json()
}

export async function retryTransient(operation, { attempts = 3, delayMs = 250, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt + 1 < attempts) await sleep(delayMs * (2 ** attempt))
    }
  }
  throw lastError
}

export function netlifyApiSubmission(submission) {
  return {
    id: submission.id,
    created_at: submission.created_at,
    data: submission.data,
  }
}

export function sheetTimeZone() {
  return process.env.REPORT_TIMEZONE || 'Asia/Kolkata'
}
