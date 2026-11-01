import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import {
  APPS_SCRIPT_REQUEST_LIMIT,
  createLeadOperationsCoordinator,
  leadHeaders,
} from '../netlify/functions/lib/lead-management.mjs'

function leadRow(id, message = '') {
  const row = Array(leadHeaders.length).fill('')
  row[0] = `BM-${id}`
  row[1] = '2026-10-30T10:00:00.000Z'
  row[7] = message
  row[24] = id
  return row
}
test('Apps Script coordinator reads paginated Lead Register rows and allowlisted Report Control', async () => {
  const calls = []
  let nonceNumber = 0
  const sample = [leadRow('page-1'), leadRow('page-2')]
  const coordinator = createLeadOperationsCoordinator({
    url: 'https://script.google.com/macros/s/test/exec', secret: 's'.repeat(40),
    now: () => 1_800_000_000_000, nonce: () => String(++nonceNumber).padStart(48, '0'),
    fetchImpl: async (_url, options) => {
      const envelope = JSON.parse(options.body)
      calls.push(envelope)
      const payload = envelope.payload
      const result = payload.operation === 'leadReadRegister'
        ? payload.offset === 0
          ? { accepted: true, snapshotLastRow: 3, offset: 0, nextOffset: 1, done: false, rows: [sample[0]] }
          : { accepted: true, snapshotLastRow: 3, offset: 1, nextOffset: 2, done: true, rows: [sample[1]] }
        : payload.operation === 'leadReadReportControl'
          ? { accepted: true, entries: {
            last_report_end_utc: '', next_report_due_utc: '', pending_report_end_utc: '', pending_report_body: '',
          } }
          : { accepted: true, updated: Object.keys(payload.entries).length }
      return { ok: true, json: async () => ({ ok: true, result }) }
    },
  })
  assert.deepEqual(await coordinator.readLeadRegister(), sample)
  assert.equal((await coordinator.readLeadReportControl()).get('pending_report_body'), '')
  assert.deepEqual(await coordinator.writeLeadReportControl({ next_report_due_utc: '2026-11-03T00:00:00.000Z' }), { accepted: true, updated: 1 })
  assert.deepEqual(calls.map(({ payload }) => payload.operation), [
    'leadReadRegister', 'leadReadRegister', 'leadReadReportControl', 'leadWriteReportControl',
  ])
  for (const envelope of calls) {
    const canonical = `${envelope.timestamp}.${envelope.nonce}.${JSON.stringify(envelope.payload)}`
    assert.equal(envelope.signature, createHmac('sha256', 's'.repeat(40)).update(canonical).digest('base64url'))
    assert.equal(envelope.payload.snapshotLastRow === undefined || envelope.payload.snapshotLastRow === null
      || envelope.payload.snapshotLastRow === 3, true)
  }
  const longBody = 'Synthetic report content with repeated words.\n'.repeat(900)
  await coordinator.writeLeadReportControl({ pending_report_body: longBody })
  const compressedEnvelope = calls.at(-1)
  assert.ok(JSON.stringify(compressedEnvelope).length < APPS_SCRIPT_REQUEST_LIMIT)
  assert.equal(Object.hasOwn(compressedEnvelope.payload.entries, 'pending_report_body'), false)
  assert.equal(gunzipSync(Buffer.from(compressedEnvelope.payload.entries.pending_report_body_gzip, 'base64')).toString('utf8'), longBody)
  await assert.rejects(coordinator.writeLeadReportControl({ other_key: 'no' }), /update is invalid/)
})

test('Apps Script coordinator chunks Lead Register appends under 40 KB and never retries uncertain chunks', async () => {
  const calls = []
  let nonceNumber = 0
  const coordinator = createLeadOperationsCoordinator({
    url: 'https://script.google.com/macros/s/test/exec', secret: 's'.repeat(40),
    now: () => 1_800_000_000_000, nonce: () => String(++nonceNumber).padStart(48, '0'),
    fetchImpl: async (_url, options) => {
      const envelope = JSON.parse(options.body)
      calls.push(envelope)
      return { ok: true, json: async () => ({ ok: true, result: {
        accepted: true, inserted: JSON.parse(gunzipSync(Buffer.from(envelope.payload.rows_gzip, 'base64')).toString('utf8')).length, alreadyPresent: 0,
      } }) }
    },
  })
  const rows = Array.from({ length: 12 }, (_, index) => leadRow(`chunk-${index}`, randomBytes(4500).toString('base64')))
  assert.deepEqual(await coordinator.appendLeadRows(rows), { inserted: 12, alreadyPresent: 0 })
  assert.ok(calls.length > 1)
  assert.equal(calls.every(({ payload }) => payload.operation === 'leadAppend'), true)
  assert.equal(calls.every((call) => JSON.stringify(call).length <= APPS_SCRIPT_REQUEST_LIMIT), true)
  const sentRows = calls.flatMap(({ payload }) => JSON.parse(gunzipSync(Buffer.from(payload.rows_gzip, 'base64')).toString('utf8')))
  assert.deepEqual(sentRows, rows)

  let uncertainCalls = 0
  const uncertain = createLeadOperationsCoordinator({
    url: 'https://script.google.com/macros/s/test/exec', secret: 's'.repeat(40),
    fetchImpl: async (_url, options) => {
      uncertainCalls += 1
      if (uncertainCalls === 2) throw new Error('simulated uncertain write')
      const payload = JSON.parse(options.body).payload
      const sent = JSON.parse(gunzipSync(Buffer.from(payload.rows_gzip, 'base64')).toString('utf8'))
      return { ok: true, json: async () => ({ ok: true, result: { accepted: true, inserted: sent.length, alreadyPresent: 0 } }) }
    },
  })
  await assert.rejects(uncertain.appendLeadRows(rows), /request failed/)
  assert.equal(uncertainCalls, 2, 'the failed append chunk is not retried and later chunks are not sent')

  let oversizedCalls = 0
  const oversized = createLeadOperationsCoordinator({
    url: 'https://script.google.com/macros/s/test/exec', secret: 's'.repeat(40),
    fetchImpl: async () => { oversizedCalls += 1; throw new Error('must not send') },
  })
  await assert.rejects(oversized.appendLeadRows([leadRow('too-large', randomBytes(40_000).toString('base64'))]), /exceeds the supported request size/)
  assert.equal(oversizedCalls, 0)
})

test('coordinator rejection diagnostics identify the operation and allowlisted error only', async () => {
  const coordinator = createLeadOperationsCoordinator({
    url: 'https://script.google.com/macros/s/test/exec', secret: 's'.repeat(40),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ ok: false, error: 'INVALID_REQUEST', detail: 'sensitive response content' }),
    }),
  })
  await assert.rejects(coordinator.readLeadRegister(), (error) => {
    assert.match(error.message, /leadReadRegister/)
    assert.match(error.message, /INVALID_REQUEST/)
    assert.doesNotMatch(error.message, /sensitive response content/)
    assert.equal(error.failurePhase, 'coordinator-response')
    return true
  })
})

test('coordinator malformed response diagnostics identify the operation without response data', async () => {
  const coordinator = createLeadOperationsCoordinator({
    url: 'https://script.google.com/macros/s/test/exec', secret: 's'.repeat(40),
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, result: null, detail: 'private' }) }),
  })
  await assert.rejects(coordinator.readLeadReportControl(), (error) => {
    assert.match(error.message, /leadReadReportControl/)
    assert.equal(error.failurePhase, 'response-validation')
    assert.doesNotMatch(error.message, /private/)
    return true
  })
})
