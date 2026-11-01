import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import leadOperations, { config as leadOperationsConfig } from '../netlify/functions/lead-operations.mjs'

test('Lead Operations remains the sole hourly scheduled lead workflow', () => {
  assert.deepEqual(leadOperationsConfig, { schedule: '0 * * * *' })
  assert.equal(typeof leadOperations, 'function')
})

test('Netlify function directory contains no postponed inbox or qualification handlers', () => {
  const functionRoot = join(process.cwd(), 'netlify', 'functions')
  for (const relativePath of [
    'lead-inbox-operations.mjs',
    'lead-qualification-operations.mjs',
    'lib/lead-inbox-consumer.mjs',
    'lib/lead-inbox-ingestion.mjs',
    'lib/lead-qualification.mjs',
  ]) assert.equal(existsSync(join(functionRoot, relativePath)), false, `${relativePath} is removed`)

  const source = readFileSync(join(functionRoot, 'lead-operations.mjs'), 'utf8')
  assert.equal(/inbox|qualification/i.test(source), false)
  assert.match(source, /appendNewLeads\(rows, coordinator\)/)
  assert.match(source, /readReportControl\(coordinator\)/)
  assert.match(source, /readLeadRegister\(coordinator\)/)
  assert.match(source, /writeReportControl/)
})
