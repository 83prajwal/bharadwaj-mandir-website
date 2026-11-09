import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { defaults } from '../src/pages/mandir-studio/lib/config.ts'
import { createVercelDesignHandler, createVercelDesignNodeHandler } from '../api/designs.js'

class MemoryStore {
  values = new Map()
  async get(key) { const value = this.values.get(key); return value ? JSON.parse(value) : null }
  async set(key, value) { this.values.set(key, value) }
  async delete(key) { this.values.delete(key) }
}

function makeNodeRequest(operation, body = {}, { method = 'POST', origin = 'https://mandir.test', headers = {} } = {}) {
  const payload = method === 'POST' ? JSON.stringify({ operation, ...body }) : ''
  const request = Readable.from(payload ? [Buffer.from(payload)] : [])
  request.method = method
  request.url = '/api/designs'
  request.headers = {
    host: 'mandir.test',
    ...(origin ? { origin } : {}),
    ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    ...headers,
  }
  return request
}

function makeNodeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value = '') { this.body = value; this.ended = true },
  }
}

async function call(nodeHandler, operation, body = {}, options = {}) {
  const response = makeNodeResponse()
  await nodeHandler(makeNodeRequest(operation, body, options), response)
  let data
  try { data = JSON.parse(response.body) } catch { data = null }
  return { response, data }
}

test('Vercel adapter opens the existing store using server credentials and delegates design operations unchanged', async () => {
  const store = new MemoryStore()
  let storeName
  let storeOptions
  const handler = createVercelDesignHandler({
    env: { NETLIFY_BLOBS_SITE_ID: 'site-id-test', NETLIFY_BLOBS_TOKEN: 'token-test' },
    getStoreFn: (name, options) => { storeName = name; storeOptions = options; return store },
  })
  assert.equal(storeName, 'bharadwaj-mandir-designs')
  assert.deepEqual(storeOptions, { siteID: 'site-id-test', token: 'token-test' })
  const nodeHandler = createVercelDesignNodeHandler({ getHandler: () => handler })

  let result = await call(nodeHandler, 'save', { name: 'Sanctuary', config: structuredClone(defaults) })
  assert.equal(result.response.statusCode, 200)
  assert.equal(result.response.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(result.response.headers['cache-control'], 'no-store')
  const { id } = result.data.design
  const { ownerSecret } = result.data
  assert.match(id, /^[0-9a-f-]{36}$/)
  assert.equal(typeof ownerSecret, 'string')
  assert.equal('ownerHash' in result.data.design, false)

  result = await call(nodeHandler, 'load', { id, ownerSecret: 'A'.repeat(43) })
  assert.equal(result.response.statusCode, 404)
  result = await call(nodeHandler, 'load', { id, ownerSecret })
  assert.equal(result.response.statusCode, 200)
  assert.deepEqual(result.data.design.config, defaults)

  result = await call(nodeHandler, 'rename', { id, ownerSecret, name: 'Renamed' })
  assert.equal(result.data.design.name, 'Renamed')
  result = await call(nodeHandler, 'duplicate', { id, ownerSecret })
  assert.equal(result.response.statusCode, 200)
  const copy = { id: result.data.design.id, ownerSecret: result.data.ownerSecret }
  assert.notEqual(copy.id, id)

  result = await call(nodeHandler, 'share', { id, ownerSecret })
  assert.equal(result.response.statusCode, 200)
  assert.equal(typeof result.data.token, 'string')
  const shared = await call(nodeHandler, 'read-share', { token: result.data.token })
  assert.equal(shared.response.statusCode, 200)
  assert.equal(shared.data.design.config.requirements, '')
  assert.equal('ownerSecret' in shared.data.design, false)

  result = await call(nodeHandler, 'revoke', { id, ownerSecret })
  assert.equal(result.data.revoked, true)
  assert.equal((await call(nodeHandler, 'read-share', { token: shared.data.token })).response.statusCode, 404)
  result = await call(nodeHandler, 'delete', copy)
  assert.equal(result.data.deleted, true)
  assert.equal((await call(nodeHandler, 'load', copy)).response.statusCode, 404)
  assert.equal((await call(nodeHandler, 'load', { id, ownerSecret })).response.statusCode, 200)
})

test('Vercel adapter preserves request validation, method handling and safe error responses', async () => {
  const handler = createVercelDesignNodeHandler({ getHandler: () => createVercelDesignHandler({ store: new MemoryStore() }) })

  let response = makeNodeResponse()
  await handler(makeNodeRequest('save', {}, { method: 'PUT' }), response)
  assert.equal(response.statusCode, 405)
  assert.equal(JSON.parse(response.body).error, 'Use GET or POST.')

  response = makeNodeResponse()
  const invalidTypeRequest = makeNodeRequest('save')
  invalidTypeRequest.headers['content-type'] = 'text/plain'
  await handler(invalidTypeRequest, response)
  assert.equal(response.statusCode, 415)

  response = makeNodeResponse()
  await handler(makeNodeRequest('save', {}, { origin: 'https://attacker.test' }), response)
  assert.equal(response.statusCode, 403)

  response = makeNodeResponse()
  const malformed = Readable.from(['{'])
  malformed.method = 'POST'
  malformed.url = '/api/designs'
  malformed.headers = { host: 'mandir.test', origin: 'https://mandir.test', 'content-type': 'application/json' }
  await handler(malformed, response)
  assert.equal(response.statusCode, 400)

  const missingCredentials = createVercelDesignNodeHandler({
    getHandler: () => createVercelDesignHandler({ env: {}, getStoreFn: () => assert.fail('Store must not initialize without credentials') }),
  })
  response = makeNodeResponse()
  await missingCredentials(makeNodeRequest('load'), response)
  assert.equal(response.statusCode, 503)
  assert.deepEqual(JSON.parse(response.body), { error: 'Design storage is temporarily unavailable.' })
  assert.equal(response.body.includes('site-id'), false)
  assert.equal(response.body.includes('token'), false)
})
