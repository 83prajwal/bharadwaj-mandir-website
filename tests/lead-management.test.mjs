import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLeadReport,
  createReportWindow,
  duplicateKey,
  fetchNetlifySubmissions,
  flagPossibleDuplicates,
  leadHeaders,
  leadStatuses,
  normalizeLead,
  percentile,
  quoteStatuses,
  retryTransient,
  selectUnseenLeadRows,
} from '../netlify/functions/lib/lead-management.mjs'
import leadOperations, { config as leadOperationsConfig, createLeadOperations } from '../netlify/functions/lead-operations.mjs'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const submission = (id, data = {}) => ({
  id,
  created_at: '2026-10-10T08:00:00.000Z',
  data: { fullName: ' Test Customer ', email: 'TEST@example.com', country: 'India', interest: 'Custom mandir', ...data },
})

test('register schema includes requested columns and controlled workflow options', () => {
  assert.equal(leadHeaders.length, 35)
  assert.deepEqual(leadHeaders.slice(0, 5), ['Lead ID', 'Submission timestamp', 'Customer name', 'Email', 'Phone'])
  assert.deepEqual(leadHeaders.slice(-7), ['Project dimensions', 'Budget', 'Desired timeline', 'Delivery needs', 'Possible duplicate review', 'Enquiry processing consent', 'Marketing consent'])
  for (const name of [
    'Lead ID', 'Submission timestamp', 'Customer name', 'Email', 'Phone', 'Country',
    'Product name or SKU', 'Enquiry message', 'Lead source', 'Lead status', 'Assigned owner',
    'Backup owner', 'Last contacted date', 'Next action', 'Follow-up due date', 'Quote status',
    'Outcome', 'Internal notes', 'Last updated timestamp', 'Netlify Submission ID',
  ]) assert.ok(leadHeaders.includes(name), `schema includes ${name}`)
  assert.deepEqual(leadStatuses, ['New', 'Contacted', 'Qualified', 'Needs Details', 'Quote in Progress', 'Quoted', 'Won', 'Lost', 'Nurture'])
  assert.ok(quoteStatuses.includes('In progress'))
})

test('normalizes verified Netlify fields and uses stable submission IDs', () => {
  const row = normalizeLead(submission('netlify-123', { productId: 'white-marble-mandir', phone: '+91 99999 12345', utm_source: 'partner' }), { now: new Date('2026-10-12T00:00:00Z') })
  assert.equal(row[0], 'BM-netlify-123')
  assert.equal(row[3], 'test@example.com')
  assert.equal(row[6], 'White Marble Mandir')
  assert.equal(row[8], 'partner')
  assert.equal(row[14], 'New')
  assert.equal(row[24], 'netlify-123')
  assert.equal(row[15], '')
  assert.equal(row[16], '')
  assert.equal(row.length, leadHeaders.length)
  assert.equal(row[33], 'No')
  assert.equal(row[34], 'No')
  const optedIn = normalizeLead(submission('consented', { privacyAcknowledged: 'yes', marketingConsent: 'yes' }))
  assert.equal(optedIn[33], 'Yes')
  assert.equal(optedIn[34], 'Yes')
})


test('rejects invalid form data and leaves no partial lead row', () => {
  assert.throws(() => normalizeLead({ id: 'id', created_at: '2026-10-10T08:00:00Z', data: { fullName: 'Name', email: 'bad', country: 'India' } }))
  assert.throws(() => normalizeLead({ id: 'id', data: {} }))
})

test('detects repeated customer/message key without discarding either submission', () => {
  const first = submission('one', { message: 'Need a custom temple' })
  const second = submission('two', { message: ' need a custom   temple ' })
  assert.equal(duplicateKey(first), duplicateKey(second))
  assert.deepEqual([...flagPossibleDuplicates([first, second])].sort(), ['one', 'two'])
  assert.equal(flagPossibleDuplicates([first]).size, 0)
})

test('deduplicates rows by stable Netlify submission ID, including duplicates in one batch', () => {
  const first = normalizeLead(submission('same'))
  const duplicate = [...first]
  const second = normalizeLead(submission('new'))
  assert.deepEqual(selectUnseenLeadRows([first, duplicate, second], []), [first, second])
  assert.deepEqual(selectUnseenLeadRows([first, second], [first]), [second])
})

test('computes nearest-rank percentiles and explicit 48-hour report windows', () => {
  assert.equal(percentile([], 0.9), null)
  assert.equal(percentile([10, 30, 20, 40], 0.5), 20)
  assert.equal(percentile([10, 30, 20, 40], 0.9), 40)
  const now = new Date('2026-10-12T00:00:00.000Z')
  assert.deepEqual(createReportWindow(now, new Map()), { initializeDue: '2026-10-14T00:00:00.000Z' })
  assert.equal(createReportWindow(now, new Map([['next_report_due_utc', '2026-10-13T00:00:00Z']])), null)
  assert.deepEqual(createReportWindow(now, new Map([['next_report_due_utc', '2026-10-11T00:00:00Z']])), {
    start: '2026-10-10T00:00:00.000Z', end: '2026-10-12T00:00:00.000Z',
  })
})

test('report reports actual window counts and labels missing analytics unavailable', () => {
  const lead = normalizeLead(submission('one', { country: 'India', interest: 'Custom mandir', utm_source: 'referral' }))
  lead[14] = 'Qualified'
  lead[27] = '2026-10-10T08:30:00.000Z'
  const report = buildLeadReport({
    leads: [lead, [...lead]],
    verified: [submission('one')],
    spam: [{ id: 'spam', created_at: '2026-10-10T09:00:00.000Z', data: {} }],
    windowStart: '2026-10-10T00:00:00.000Z',
    windowEnd: '2026-10-12T00:00:00.000Z',
    now: new Date('2026-10-12T00:00:00.000Z'),
  })
  assert.match(report, /Unique new enquiries in register: 1/)
  assert.match(report, /Spam submissions in window: 1/)
  assert.match(report, /Qualified new leads: 1/)
  assert.match(report, /Median recorded first-human response: 30 minutes/)
  assert.match(report, /analytics is not connected/)
})

test('retries transient operations and succeeds without logging submitted values', async () => {
  let attempts = 0
  const result = await retryTransient(async () => {
    attempts += 1
    if (attempts < 3) throw new Error('temporary')
    return 'ok'
  }, { delayMs: 0, sleep: async () => {} })
  assert.equal(result, 'ok')
  assert.equal(attempts, 3)
})

test('the synchronizer is a scheduled function, not a public unauthenticated endpoint', async () => {
  assert.equal(typeof leadOperations, 'function')
  assert.deepEqual(leadOperationsConfig, { schedule: '0 * * * *' })
})

test('Lead Operations preserves the hourly sync workflow through the Apps Script coordinator', async () => {
  const envNames = [
    'NETLIFY_ACCESS_TOKEN', 'NETLIFY_FORM_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', 'GOOGLE_SPREADSHEET_ID',
  ]
  const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]))
  process.env.NETLIFY_ACCESS_TOKEN = 'synthetic-token'
  process.env.NETLIFY_FORM_ID = 'synthetic-form'
  for (const name of envNames.slice(2)) delete process.env[name]
  const existingId = 'saved-lead'
  const appended = []
  const control = new Map([['next_report_due_utc', '2099-01-01T00:00:00.000Z']])
  const logs = []
  try {
    const handler = createLeadOperations({
      coordinatorFactory: ({ requestTimeoutMs }) => {
        assert.equal(requestTimeoutMs, 15_000)
        return {
          appendLeadRows: async (rows) => {
            const unseen = rows.filter((row) => row[24] !== existingId)
            appended.push(...unseen)
            return { inserted: unseen.length, alreadyPresent: rows.length - unseen.length }
          },
          readLeadReportControl: async () => new Map(control),
          writeLeadReportControl: async (entries) => { for (const [key, value] of Object.entries(entries)) control.set(key, value); return { accepted: true } },
          readLeadRegister: async () => [],
        }
      },
      fetchImpl: async () => ({ ok: true, json: async () => [submission('saved-lead'), submission('fresh-lead')] }),
      logger: { log: (message) => logs.push(message), error: (message) => logs.push(message) },
    })
    await handler()
    assert.equal(appended.length, 1)
    assert.equal(appended[0][24], 'fresh-lead')
    assert.equal(logs.includes('Lead register reconciled; next 48-hour report is not due.'), true)
    assert.equal(control.get('next_report_due_utc'), '2099-01-01T00:00:00.000Z')
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('Lead Operations preserves the 48-hour pending report and email idempotency flow', async () => {
  const envNames = ['NETLIFY_ACCESS_TOKEN', 'NETLIFY_FORM_ID', 'RESEND_API_KEY', 'REPORT_FROM_EMAIL', 'REPORT_TO_EMAIL']
  const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]))
  Object.assign(process.env, {
    NETLIFY_ACCESS_TOKEN: 'synthetic-token', NETLIFY_FORM_ID: 'synthetic-form',
    RESEND_API_KEY: 'synthetic-resend-key', REPORT_FROM_EMAIL: 'from@example.test', REPORT_TO_EMAIL: 'to@example.test',
  })
  const due = new Date(Date.now() - 60_000).toISOString()
  const reportSubmission = submission('report-lead')
  reportSubmission.created_at = new Date(Date.now() - 60 * 60_000).toISOString()
  const leadRow = normalizeLead(reportSubmission)
  const control = new Map([
    ['last_report_end_utc', ''], ['next_report_due_utc', due],
    ['pending_report_end_utc', ''], ['pending_report_body', ''],
  ])
  const updates = []
  let emailRequest
  try {
    const handler = createLeadOperations({
      coordinatorFactory: () => ({
        appendLeadRows: async (rows) => ({ inserted: rows.length, alreadyPresent: 0 }),
        readLeadReportControl: async () => new Map(control),
        writeLeadReportControl: async (entries) => {
          updates.push({ ...entries })
          for (const [key, value] of Object.entries(entries)) control.set(key, value)
          return { accepted: true }
        },
        readLeadRegister: async () => [leadRow],
      }),
      fetchImpl: async (url, options = {}) => {
        if (url.startsWith('https://api.netlify.com/')) {
          return { ok: true, json: async () => new URL(url).searchParams.get('state') === 'spam' ? [] : [reportSubmission] }
        }
        emailRequest = { url, options, body: JSON.parse(options.body) }
        return { ok: true, json: async () => ({ id: 'synthetic-email-id' }) }
      },
      logger: { log() {}, error() {} },
    })
    await handler()
    assert.equal(emailRequest.url, 'https://api.resend.com/emails')
    assert.match(emailRequest.options.headers['Idempotency-Key'], /^bharadwaj-lead-report-\d+$/)
    const end = updates[0].pending_report_end_utc
    assert.ok(Date.parse(end) >= Date.parse(due))
    assert.ok(Date.parse(end) - Date.parse(due) < 120_000)
    assert.ok(emailRequest.body.subject.includes(end))
    assert.equal(updates[0].pending_report_end_utc, end)
    assert.ok(updates.some((entry) => typeof entry.pending_report_body === 'string' && entry.pending_report_body.length > 0))
    assert.equal(updates.at(-1).next_report_due_utc, new Date(Date.parse(end) + 48 * 3600000).toISOString())
    assert.equal(control.get('pending_report_end_utc'), '')
    assert.equal(control.get('pending_report_body'), '')
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('uncertain Lead Register append stops the run without retrying or sending a report', async () => {
  const envNames = ['NETLIFY_ACCESS_TOKEN', 'NETLIFY_FORM_ID']
  const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]))
  process.env.NETLIFY_ACCESS_TOKEN = 'synthetic-token'
  process.env.NETLIFY_FORM_ID = 'synthetic-form'
  let appendCalls = 0
  let reportReads = 0
  const errors = []
  try {
    const handler = createLeadOperations({
      coordinatorFactory: () => ({
        readLeadRegister: async () => [],
        appendLeadRows: async () => { appendCalls += 1; throw new Error('simulated uncertain response') },
        readLeadReportControl: async () => { reportReads += 1; return new Map() },
      }),
      fetchImpl: async () => ({ ok: true, json: async () => [submission('uncertain-lead')] }),
      logger: { log() {}, error: (message) => errors.push(message) },
    })
    await assert.rejects(handler(), /Lead operations failed/)
    assert.equal(appendCalls, 1)
    assert.equal(reportReads, 0)
    assert.equal(errors.length, 1)
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('uncertain Report Control write is not retried within the invocation', async () => {
  const envNames = ['NETLIFY_ACCESS_TOKEN', 'NETLIFY_FORM_ID']
  const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]))
  process.env.NETLIFY_ACCESS_TOKEN = 'synthetic-token'
  process.env.NETLIFY_FORM_ID = 'synthetic-form'
  let writeCalls = 0
  try {
    const handler = createLeadOperations({
      coordinatorFactory: () => ({
        appendLeadRows: async () => ({ inserted: 0, alreadyPresent: 0 }),
        readLeadReportControl: async () => new Map(),
        writeLeadReportControl: async () => { writeCalls += 1; throw new Error('simulated uncertain response') },
      }),
      fetchImpl: async () => ({ ok: true, json: async () => [] }),
      logger: { log() {}, error() {} },
    })
    await assert.rejects(handler(), /Lead operations failed/)
    assert.equal(writeCalls, 1)
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

test('Netlify API access fails closed when server credentials are missing', async () => {
  const oldToken = process.env.NETLIFY_ACCESS_TOKEN
  const oldFormId = process.env.NETLIFY_FORM_ID
  delete process.env.NETLIFY_ACCESS_TOKEN
  delete process.env.NETLIFY_FORM_ID
  let called = false
  try {
    await assert.rejects(fetchNetlifySubmissions({ fetchImpl: async () => { called = true } }), /NETLIFY_ACCESS_TOKEN/)
    assert.equal(called, false)
  } finally {
    if (oldToken !== undefined) process.env.NETLIFY_ACCESS_TOKEN = oldToken
    if (oldFormId !== undefined) process.env.NETLIFY_FORM_ID = oldFormId
  }
})

test('Netlify verified submissions request uses the verified-list endpoint and succeeds', async () => {
  const previous = { token: process.env.NETLIFY_ACCESS_TOKEN, formId: process.env.NETLIFY_FORM_ID }
  process.env.NETLIFY_ACCESS_TOKEN = 'test-token'
  process.env.NETLIFY_FORM_ID = 'synthetic-form-id'
  let requestUrl
  let requestOptions
  try {
    const result = await fetchNetlifySubmissions({
      state: 'verified',
      fetchImpl: async (url, options) => {
        requestUrl = url
        requestOptions = options
        return { ok: true, json: async () => [] }
      },
      logger: { error() { throw new Error('success path must not log a failure') } },
    })
    assert.deepEqual(result, [])
    const parsed = new URL(requestUrl)
    assert.equal(parsed.pathname, '/api/v1/forms/synthetic-form-id/submissions')
    assert.equal(parsed.searchParams.get('page'), '1')
    assert.equal(parsed.searchParams.get('per_page'), '100')
    assert.equal(parsed.searchParams.has('state'), false)
    assert.equal(requestOptions.headers.authorization, 'Bearer test-token')
  } finally {
    if (previous.token === undefined) delete process.env.NETLIFY_ACCESS_TOKEN
    else process.env.NETLIFY_ACCESS_TOKEN = previous.token
    if (previous.formId === undefined) delete process.env.NETLIFY_FORM_ID
    else process.env.NETLIFY_FORM_ID = previous.formId
  }
})

test('Netlify spam submissions request uses the documented state=spam query and succeeds', async () => {
  const previous = { token: process.env.NETLIFY_ACCESS_TOKEN, formId: process.env.NETLIFY_FORM_ID }
  process.env.NETLIFY_ACCESS_TOKEN = 'test-token'
  process.env.NETLIFY_FORM_ID = 'synthetic-form-id'
  let requestUrl
  try {
    const result = await fetchNetlifySubmissions({
      state: 'spam',
      fetchImpl: async (url) => {
        requestUrl = url
        return { ok: true, json: async () => [] }
      },
      logger: { error() { throw new Error('success path must not log a failure') } },
    })
    assert.deepEqual(result, [])
    const parsed = new URL(requestUrl)
    assert.equal(parsed.pathname, '/api/v1/forms/synthetic-form-id/submissions')
    assert.equal(parsed.searchParams.get('state'), 'spam')
    assert.equal(parsed.searchParams.get('page'), '1')
    assert.equal(parsed.searchParams.get('per_page'), '100')
  } finally {
    if (previous.token === undefined) delete process.env.NETLIFY_ACCESS_TOKEN
    else process.env.NETLIFY_ACCESS_TOKEN = previous.token
    if (previous.formId === undefined) delete process.env.NETLIFY_FORM_ID
    else process.env.NETLIFY_FORM_ID = previous.formId
  }
})

test('Netlify submissions failures identify verified or spam state and HTTP status without response data', async () => {
  const previous = { token: process.env.NETLIFY_ACCESS_TOKEN, formId: process.env.NETLIFY_FORM_ID }
  process.env.NETLIFY_ACCESS_TOKEN = 'test-token'
  process.env.NETLIFY_FORM_ID = 'synthetic-form-id'
  try {
    for (const state of ['verified', 'spam']) {
      const diagnostics = []
      await assert.rejects(fetchNetlifySubmissions({
        state,
        fetchImpl: async () => ({ ok: false, status: 404, json: async () => { throw new Error('body must not be read') } }),
        logger: { error(message) { diagnostics.push(message) } },
      }), new RegExp(`Netlify ${state} submissions API failed \\(HTTP 404\\)`))
      assert.deepEqual(diagnostics, [`Netlify ${state} submissions request failed (HTTP 404).`])
      assert.equal(diagnostics.join(' ').includes('test-token'), false)
      assert.equal(diagnostics.join(' ').includes('synthetic-form-id'), false)
    }
  } finally {
    if (previous.token === undefined) delete process.env.NETLIFY_ACCESS_TOKEN
    else process.env.NETLIFY_ACCESS_TOKEN = previous.token
    if (previous.formId === undefined) delete process.env.NETLIFY_FORM_ID
    else process.env.NETLIFY_FORM_ID = previous.formId
  }
})

test('built public assets contain no server credential names or function source', (context) => {
  const assetsPath = join(process.cwd(), 'dist', 'assets')
  if (!existsSync(assetsPath)) return context.skip('Run the production build before checking public bundles.')
  const bundle = readdirSync(assetsPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(assetsPath, entry.name), 'utf8'))
    .join('\n')
  for (const secretName of ['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', 'NETLIFY_ACCESS_TOKEN', 'RESEND_API_KEY']) {
    assert.equal(bundle.includes(secretName), false, `${secretName} is not in public assets`)
  }
})
