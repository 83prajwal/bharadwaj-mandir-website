import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const headers = [
  'Lead ID', 'Submission timestamp', 'Customer name', 'Email', 'Phone', 'Country',
  'Product name or SKU', 'Enquiry message', 'Lead source', 'UTM source', 'UTM medium',
  'UTM campaign', 'UTM term', 'UTM content', 'Lead status', 'Assigned owner', 'Backup owner',
  'Last contacted date', 'Next action', 'Follow-up due date', 'Quote status', 'Outcome',
  'Internal notes', 'Last updated timestamp', 'Netlify Submission ID', 'City',
  'Product interest', 'First human response timestamp', 'Project dimensions', 'Budget',
  'Desired timeline', 'Delivery needs', 'Possible duplicate review', 'Enquiry processing consent', 'Marketing consent',
]
const controlKeys = ['last_report_end_utc', 'next_report_due_utc', 'pending_report_end_utc', 'pending_report_body']

function fakeSheet(rows) {
  return {
    rows,
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map((row) => row.length)),
    getRange(row, col, rowCount = 1, colCount = 1) {
      return {
        getValues: () => Array.from({ length: rowCount }, (_, r) => Array.from({ length: colCount }, (_, c) => rows[row - 1 + r]?.[col - 1 + c] ?? '')),
        getDisplayValues: () => Array.from({ length: rowCount }, (_, r) => Array.from({ length: colCount }, (_, c) => {
          const value = rows[row - 1 + r]?.[col - 1 + c] ?? ''
          return value instanceof Date ? value.toISOString() : String(value)
        })),
        setValues(values) { values.forEach((line, r) => {
          rows[row - 1 + r] ||= []
          line.forEach((value, c) => { rows[row - 1 + r][col - 1 + c] = typeof value === 'string' && value.startsWith("'=") ? value.slice(1) : value })
        }) },
        setValue(value) { rows[row - 1] ||= []; rows[row - 1][col - 1] = typeof value === 'string' && value.startsWith("'=") ? value.slice(1) : value },
      }
    },
  }
}

function syntheticSubmission(id, overrides = {}) {
  return {
    id,
    created_at: '2026-10-30T10:00:00.000Z',
    data: {
      fullName: 'Synthetic Customer', email: 'synthetic@example.test', phone: '0000000000',
      country: 'India', productId: 'white-marble-mandir', message: 'Synthetic enquiry',
      interest: 'Home mandir', dimensions: 'Test dimensions', budget: 'Test budget',
      timeline: 'Test timeline', deliveryNeeds: 'Test delivery', privacyAcknowledged: 'yes',
      marketingConsent: 'no', ...overrides,
    },
  }
}

function harness({ submissions = [], properties: overrides = {}, fetchImpl } = {}) {
  const register = fakeSheet([headers])
  const control = fakeSheet([['Control key', 'Value'], ...controlKeys.map((key) => [key, ''])])
  const properties = new Map(Object.entries({
    LEAD_SPREADSHEET_ID: 'synthetic-sheet-id',
    NETLIFY_ACCESS_TOKEN: 'synthetic-netlify-token',
    NETLIFY_FORM_ID: 'synthetic-form-id',
    RESEND_API_KEY: 'synthetic-resend-key',
    REPORT_FROM_EMAIL: 'sender@example.test',
    REPORT_TO_EMAIL: 'recipient@example.test',
    ...overrides,
  }))
  const triggers = []
  const calls = []
  const scriptFetch = fetchImpl || ((url, options) => {
    calls.push({ url, options })
    if (url.includes('api.netlify.com')) {
      const spam = new URL(url).searchParams.get('state') === 'spam'
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(spam ? [] : submissions) }
    }
    return { getResponseCode: () => 200, getContentText: () => '{"id":"synthetic-email-id"}' }
  })
  const context = {
    Date, JSON, Math, Object, String, Array, Set, Map, Number, Error, URL,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) || null }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: (name) => ({ 'Lead Register': register, 'Report Control': control })[name] || null }), flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    UrlFetchApp: { fetch: scriptFetch },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      newTrigger: (handler) => ({
        timeBased: () => ({ everyHours: (hours) => ({ create: () => {
          const trigger = { handler, hours, getHandlerFunction: () => handler }
          triggers.push(trigger)
          return trigger
        } }) }),
      }),
    },
    Utilities: { formatDate: (date) => date.toISOString() },
    Logger: { log() {} },
  }
  vm.createContext(context)
  vm.runInContext(readFileSync('scripts/apps-script/Code.gs', 'utf8'), context)
  return { context, register, control, triggers, calls, properties }
}

test('hourly trigger setup is idempotent and does not create an extra report trigger', () => {
  const app = harness()
  assert.match(app.context.setupHourlyLeadOperationsTrigger(), /created/)
  assert.equal(app.triggers.length, 1)
  assert.equal(app.triggers[0].handler, 'runLeadOperationsHourly')
  assert.equal(app.triggers[0].hours, 1)
  assert.match(app.context.setupHourlyLeadOperationsTrigger(), /already exists/)
  assert.equal(app.triggers.length, 1)
})

test('Netlify submission mapper preserves the current 35-column schema', () => {
  const app = harness()
  const row = app.context.normalizeLeadSubmission_(syntheticSubmission('map-1'), new Set(), new Date('2026-11-01T12:00:00.000Z'))
  assert.equal(row.length, 35)
  assert.equal(row[0], 'BM-map-1')
  assert.equal(row[1].toISOString(), '2026-10-30T10:00:00.000Z')
  assert.equal(row[2], 'Synthetic Customer')
  assert.equal(row[6], 'White Marble Mandir')
  assert.equal(row[24], 'map-1')
  assert.equal(row[28], 'Test dimensions')
  assert.equal(row[33], 'Yes')
})

test('Lead Register appends deduplicate by Netlify Submission ID and preserve existing rows', () => {
  const app = harness()
  const existing = Array(35).fill('')
  existing[0] = 'BM-duplicate-1'
  existing[2] = 'Existing value stays'
  existing[24] = 'duplicate-1'
  app.register.rows.push(existing)
  const submissions = [syntheticSubmission('duplicate-1'), syntheticSubmission('new-1'), syntheticSubmission('new-1')]
  const result = app.context.appendNewLeadSubmissions_(submissions, new Date('2026-11-01T12:00:00.000Z'))
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { inserted: 1, alreadyPresent: 2 })
  assert.equal(app.register.rows.length, 3)
  assert.equal(app.register.rows[1][2], 'Existing value stays')
  assert.equal(app.register.rows[2][24], 'new-1')
})

test('report scheduler initializes at 48 hours and resumes a persisted pending window', () => {
  const app = harness()
  const now = new Date('2026-11-01T12:00:00.000Z')
  const empty = new Map(controlKeys.map((key) => [key, '']))
  const first = app.context.reportWindow_(now, empty)
  assert.equal(first.initializeDue.toISOString(), '2026-11-03T12:00:00.000Z')
  const pendingEnd = '2026-11-04T12:00:00.000Z'
  const pending = new Map([...empty, ['pending_report_end_utc', pendingEnd]])
  const resumed = app.context.reportWindow_(now, pending)
  assert.equal(resumed.end.toISOString(), pendingEnd)
  assert.equal(resumed.start.toISOString(), '2026-11-02T12:00:00.000Z')
  const due = new Map([...empty, ['next_report_due_utc', '2026-10-31T12:00:00.000Z']])
  assert.equal(app.context.reportWindow_(now, due).end.toISOString(), now.toISOString())
})

test('Report Control writes preserve the four-key structure and unrelated stored values', () => {
  const app = harness()
  app.control.rows[1][1] = '2026-10-30T12:00:00.000Z'
  app.context.writeReportControl_({ pending_report_end_utc: '2026-11-01T12:00:00.000Z' })
  assert.deepEqual(app.control.rows.slice(0, 5), [
    ['Control key', 'Value'],
    ['last_report_end_utc', '2026-10-30T12:00:00.000Z'],
    ['next_report_due_utc', ''],
    ['pending_report_end_utc', '2026-11-01T12:00:00.000Z'],
    ['pending_report_body', ''],
  ])
})

test('report email retries reuse the persisted window idempotency key', () => {
  const app = harness()
  const end = new Date('2026-11-03T12:00:00.000Z')
  app.context.sendLeadReport_('Synthetic report body', end)
  app.context.sendLeadReport_('Synthetic report body', end)
  assert.equal(app.calls.length, 2)
  assert.equal(app.calls[0].options.headers['Idempotency-Key'], 'bharadwaj-lead-report-' + end.getTime())
  assert.equal(app.calls[1].options.headers['Idempotency-Key'], app.calls[0].options.headers['Idempotency-Key'])
})

test('hourly sync requests verified and spam lists but appends only verified records', () => {
  const app = harness({ submissions: [syntheticSubmission('verified-1')] })
  app.context.runLeadOperationsHourly()
  assert.equal(app.register.rows.length, 2)
  assert.equal(app.register.rows[1][24], 'verified-1')
  assert.equal(app.calls.filter((call) => call.url.includes('api.netlify.com')).length, 2)
  assert.equal(app.calls.some((call) => new URL(call.url).searchParams.get('state') === 'spam'), true)
  assert.ok(Math.abs(Date.parse(app.control.rows[2][1]) - Date.now() - 48 * 3600000) < 3000)
})
