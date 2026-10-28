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
import leadOperations, { config as leadOperationsConfig } from '../netlify/functions/lead-operations.mjs'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const submission = (id, data = {}) => ({
  id,
  created_at: '2026-10-10T08:00:00.000Z',
  data: { fullName: ' Test Customer ', email: 'TEST@example.com', country: 'India', interest: 'Custom mandir', ...data },
})

test('register schema includes requested columns and controlled workflow options', () => {
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
