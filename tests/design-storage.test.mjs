import test from 'node:test'
import assert from 'node:assert/strict'
import { defaults } from '../src/pages/mandir-studio/lib/config.ts'
import { createDesignHandler } from '../netlify/functions/lib/design-storage.mjs'
import { createVercelDesignsHandler, createVercelDesignsNodeHandler } from '../api/designs.js'
import { Readable } from 'node:stream'

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

function vercelRequest(request) {
  return (async () => {
    const url = new URL(request.url)
    const input = request.method === 'GET' || request.method === 'HEAD'
      ? Readable.from([])
      : Readable.from([Buffer.from(await request.clone().arrayBuffer())])
    input.method = request.method
    input.url = `${url.pathname}${url.search}`
    input.headers = {
      ...Object.fromEntries(request.headers.entries()),
      host: url.host,
      'x-forwarded-proto': url.protocol.slice(0, -1),
      'x-real-ip': '203.0.113.12',
    }

    const headers = new Headers()
    const response = {
      statusCode: 200,
      setHeader(name, value) { headers.set(name, value) },
      end(body) { this.body = body },
    }
    await createVercelDesignsNodeHandler({ designHandler: requestHandler })(input, response)
    return new Response(response.body, { status: response.statusCode, headers })
  })()
}

let requestHandler

function vercelDesignRequest(operation, body = {}, method = 'POST') {
  const url = new URL('https://mandir.test/api/designs')
  if (method === 'GET') {
    for (const [key, value] of Object.entries(body)) url.searchParams.set(key, value)
    return new Request(url, { method, headers: { origin: url.origin } })
  }
  return new Request(url, {
    method,
    headers: { origin: url.origin, 'content-type': 'application/json' },
    body: JSON.stringify({ operation, ...body }),
  })
}

test('Vercel adapter initializes the existing Blobs store with explicit trimmed credentials', async () => {
  const store = new MemoryStore()
  let initialized
  requestHandler = createVercelDesignsHandler({
    env: { NETLIFY_BLOBS_SITE_ID: ' site-id ', NETLIFY_BLOBS_TOKEN: ' token ' },
    getStoreFn: (name, options) => { initialized = { name, options }; return store },
  })
  const config = structuredClone(defaults)
  const response = await vercelRequest(vercelDesignRequest('save', { name: 'Vercel design', config }))
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(initialized.name, 'bharadwaj-mandir-designs')
  assert.deepEqual(initialized.options, { siteID: 'site-id', token: 'token' })
  assert.match(payload.design.id, /^[0-9a-f-]{36}$/)
  assert.equal(typeof payload.ownerSecret, 'string')
})

test('Vercel adapter preserves save, load, update, duplicate, share, read, revoke and delete behavior', async () => {
  const store = new MemoryStore()
  requestHandler = createVercelDesignsHandler({ store, now: () => new Date('2026-11-14T00:00:00.000Z') })
  const config = structuredClone(defaults)
  let response = await vercelRequest(vercelDesignRequest('save', { name: 'Vercel design', config }))
  let payload = await response.json()
  assert.equal(response.status, 200)
  const { id, ownerSecret } = { ...payload.design, ownerSecret: payload.ownerSecret }

  response = await vercelRequest(vercelDesignRequest('load', { id, ownerSecret }))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).design.config, config)

  response = await vercelRequest(vercelDesignRequest('save', { id, ownerSecret, name: 'Updated', config: { ...config, width: 1300, availableWidth: 1400 } }))
  payload = await response.json()
  assert.equal(payload.design.name, 'Updated')
  assert.equal(payload.design.config.width, 1300)

  response = await vercelRequest(vercelDesignRequest('duplicate', { id, ownerSecret }))
  const copy = await response.json()
  assert.equal(response.status, 200)
  assert.notEqual(copy.design.id, id)

  response = await vercelRequest(vercelDesignRequest('share', { id, ownerSecret }))
  const share = await response.json()
  assert.equal(response.status, 200)
  response = await vercelRequest(vercelDesignRequest('', { operation: 'read-share', token: share.token }, 'GET'))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).design.config.requirements, '')

  response = await vercelRequest(vercelDesignRequest('revoke', { id, ownerSecret }))
  assert.equal((await response.json()).revoked, true)
  response = await vercelRequest(vercelDesignRequest('', { operation: 'read-share', token: share.token }, 'GET'))
  assert.equal(response.status, 404)

  response = await vercelRequest(vercelDesignRequest('delete', { id, ownerSecret }))
  assert.equal((await response.json()).deleted, true)
  response = await vercelRequest(vercelDesignRequest('load', { id, ownerSecret }))
  assert.equal(response.status, 404)
})

test('Vercel adapter safely handles missing credentials, unauthorized access and unavailable Blobs', async () => {
  requestHandler = createVercelDesignsHandler({ env: { NETLIFY_BLOBS_SITE_ID: '', NETLIFY_BLOBS_TOKEN: '' } })
  let response = await vercelRequest(vercelDesignRequest('save', { name: 'Unavailable', config: defaults }))
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'Design storage is temporarily unavailable.' })

  requestHandler = createVercelDesignsHandler({ store: new MemoryStore() })
  response = await vercelRequest(vercelDesignRequest('load', { id: '12345678-1234-1234-1234-123456789abc', ownerSecret: 'x'.repeat(43) }))
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'Saved design not found.' })

  const brokenStore = { async get() { throw new Error('private provider detail') } }
  requestHandler = createVercelDesignsHandler({ store: brokenStore })
  response = await vercelRequest(vercelDesignRequest('read-share', { token: 'a'.repeat(43) }))
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Design storage is temporarily unavailable.' })
})

test('Vercel adapter preserves Netlify handler validation and endpoint configuration', async () => {
  const caller = await import('node:fs/promises').then(({ readFile }) => readFile('src/pages/MandirDesigner.jsx', 'utf8'))
  assert.match(caller, /const DESIGN_API = '\/api\/designs'/)

  requestHandler = createVercelDesignsHandler({ store: new MemoryStore() })
  const invalid = { ...structuredClone(defaults), width: '1200' }
  const response = await vercelRequest(vercelDesignRequest('save', { name: 'Invalid', config: invalid }))
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /width/i)
})
