import test from 'node:test'
import assert from 'node:assert/strict'
import { defaults } from '../src/pages/mandir-studio/lib/config.ts'
import { createDesignHandler } from '../netlify/functions/lib/design-storage.mjs'

class MemoryStore {
  values = new Map()
  async get(key) { const value = this.values.get(key); return value ? JSON.parse(value) : null }
  async set(key, value) { this.values.set(key, value) }
  async delete(key) { this.values.delete(key) }
}

function makeRequest(operation, body = {}, { origin = 'https://mandir.test', size = false } = {}) {
  const payload = size ? JSON.stringify({ operation, padding: 'x'.repeat(41_000) }) : JSON.stringify({ operation, ...body })
  return new Request('https://mandir.test/.netlify/functions/designs', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: payload,
  })
}

async function call(handler, operation, body, options) {
  const response = await handler(makeRequest(operation, body, options))
  return { response, data: await response.json() }
}

test('designs persist, update, rename, duplicate and delete only with owner capability', async () => {
  const store = new MemoryStore(); const handler = createDesignHandler({ store })
  const config = structuredClone(defaults)
  let result = await call(handler, 'save', { name: 'Sanctuary', config })
  assert.equal(result.response.status, 200)
  const { id, ownerSecret } = result.data.design ? { ...result.data.design, ownerSecret: result.data.ownerSecret } : {}
  assert.match(id, /^[0-9a-f-]{36}$/)
  assert.equal(typeof ownerSecret, 'string')
  assert.equal('ownerHash' in result.data.design, false)

  result = await call(handler, 'load', { id, ownerSecret: 'A'.repeat(43) })
  assert.equal(result.response.status, 404)
  result = await call(handler, 'load', { id, ownerSecret })
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.data.design.config, config)

  const changed = { ...config, width: 1250, availableWidth: 1500 }
  result = await call(handler, 'save', { id, ownerSecret, name: 'Updated sanctuary', config: changed })
  assert.equal(result.data.design.createdAt, (await call(handler, 'load', { id, ownerSecret })).data.design.createdAt)
  assert.equal(result.data.design.name, 'Updated sanctuary')
  assert.equal(result.data.design.config.width, 1250)

  result = await call(handler, 'rename', { id, ownerSecret, name: 'Renamed' })
  assert.equal(result.data.design.name, 'Renamed')
  result = await call(handler, 'duplicate', { id, ownerSecret })
  assert.notEqual(result.data.design.id, id)
  assert.equal(result.data.design.name, 'Renamed copy')
  assert.notEqual(result.data.ownerSecret, ownerSecret)
  const copy = { id: result.data.design.id, ownerSecret: result.data.ownerSecret }
  result = await call(handler, 'delete', copy)
  assert.equal(result.data.deleted, true)
  assert.equal((await call(handler, 'load', copy)).response.status, 404)
  assert.equal((await call(handler, 'load', { id, ownerSecret })).response.status, 200)
})

test('share links expose read-only public fields, expire and can be revoked by owner', async () => {
  const store = new MemoryStore(); let date = new Date('2026-11-02T00:00:00.000Z')
  const handler = createDesignHandler({ store, now: () => new Date(date) })
  const config = { ...structuredClone(defaults), requirements: 'private customer note' }
  const saved = (await call(handler, 'save', { name: 'Shared', config })).data
  const owner = { id: saved.design.id, ownerSecret: saved.ownerSecret }
  const shared = await call(handler, 'share', owner)
  assert.equal(shared.response.status, 200)
  assert.equal(shared.data.token.length, 43)
  const read = await call(handler, 'read-share', { token: shared.data.token })
  assert.equal(read.response.status, 200)
  assert.equal(read.data.design.config.requirements, '')
  assert.equal('id' in read.data.design, false)
  assert.equal('ownerSecret' in read.data.design, false)
  assert.equal('ownerHash' in read.data.design, false)
  assert.equal((await call(handler, 'revoke', owner)).data.revoked, true)
  assert.equal((await call(handler, 'read-share', { token: shared.data.token })).response.status, 404)

  const newShare = await call(handler, 'share', owner)
  date = new Date(date.getTime() + 91 * 24 * 60 * 60 * 1000)
  const expired = await call(handler, 'read-share', { token: newShare.data.token })
  assert.equal(expired.response.status, 404)
  assert.match(expired.data.error, /expired/)
  assert.equal((await call(handler, 'read-share', { token: 'not-a-valid-token' })).response.status, 404)
})

test('server rejects malformed, invalid, oversized and cross-origin design writes', async () => {
  const handler = createDesignHandler({ store: new MemoryStore() })
  const invalid = structuredClone(defaults); invalid.width = '1200'
  assert.equal((await call(handler, 'save', { name: 'Invalid', config: invalid })).response.status, 400)
  const unknown = { ...structuredClone(defaults), internalNotes: 'not allowed' }
  assert.equal((await call(handler, 'save', { name: 'Invalid', config: unknown })).response.status, 400)
  assert.equal((await call(handler, 'save', { name: 'Invalid', config: defaults }, { size: true })).response.status, 413)
  assert.equal((await call(handler, 'save', { name: 'Invalid', config: defaults }, { origin: 'https://attacker.test' })).response.status, 403)
})
