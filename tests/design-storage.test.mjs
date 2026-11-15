import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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

function vercelRequest(request, handler = requestHandler) {
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
    await createVercelDesignsNodeHandler({ designHandler: handler })(input, response)
    return new Response(response.body, { status: response.statusCode, headers })
  })()
}

let requestHandler

function vercelDesignRequest(operation, body = {}, method = 'POST', extraHeaders = {}) {
  const url = new URL('https://mandir.test/api/designs')
  if (method === 'GET') {
    for (const [key, value] of Object.entries(body)) url.searchParams.set(key, value)
    return new Request(url, { method, headers: { origin: url.origin, ...extraHeaders } })
  }
  return new Request(url, {
    method,
    headers: { origin: url.origin, 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ operation, ...body }),
  })
}

test('Vercel adapter initializes the existing Blobs store with explicit trimmed credentials', async () => {
  const store = new MemoryStore()
  let initialized
  requestHandler = createVercelDesignsHandler({
    metadataEnabled: false,
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
  requestHandler = createVercelDesignsHandler({ metadataEnabled: false, store, now: () => new Date('2026-11-14T00:00:00.000Z') })
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
  requestHandler = createVercelDesignsHandler({ metadataEnabled: false, env: { NETLIFY_BLOBS_SITE_ID: '', NETLIFY_BLOBS_TOKEN: '' } })
  let response = await vercelRequest(vercelDesignRequest('save', { name: 'Unavailable', config: defaults }))
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'Design storage is temporarily unavailable.' })

  requestHandler = createVercelDesignsHandler({ metadataEnabled: false, store: new MemoryStore() })
  response = await vercelRequest(vercelDesignRequest('load', { id: '12345678-1234-1234-1234-123456789abc', ownerSecret: 'x'.repeat(43) }))
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'Saved design not found.' })

  const brokenStore = { async get() { throw new Error('private provider detail') } }
  requestHandler = createVercelDesignsHandler({ metadataEnabled: false, store: brokenStore })
  response = await vercelRequest(vercelDesignRequest('read-share', { token: 'a'.repeat(43) }))
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Design storage is temporarily unavailable.' })
})

test('Vercel adapter preserves Netlify handler validation and endpoint configuration', async () => {
  const caller = await import('node:fs/promises').then(({ readFile }) => readFile('src/pages/MandirDesigner.jsx', 'utf8'))
  assert.match(caller, /const DESIGN_API = '\/api\/designs'/)

  requestHandler = createVercelDesignsHandler({ metadataEnabled: false, store: new MemoryStore() })
  const invalid = { ...structuredClone(defaults), width: '1200' }
  const response = await vercelRequest(vercelDesignRequest('save', { name: 'Invalid', config: invalid }))
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /width/i)
})

function metadataRepository(profiles = []) {
  const profileRows = new Map(profiles.map((profile) => [profile.netlify_identity_id, profile]))
  const designRows = new Map()
  return {
    profileRows,
    designRows,
    async findProfile(identityId) { return profileRows.get(identityId) || null },
    async findDesignById(id) { return designRows.get(id) || null },
    async findDesign(id, customerId) {
      const row = designRows.get(id)
      return row?.customer_id === customerId ? row : null
    },
    async listDesigns(customerId) {
      return [...designRows.values()].filter((row) => row.customer_id === customerId)
    },
    async saveDesign(row) {
      const existing = designRows.get(row.id)
      if (existing && existing.customer_id !== row.customer_id) throw Object.assign(new Error('ownership conflict'), { status: 409 })
      const saved = structuredClone(row)
      designRows.set(row.id, saved)
      return saved
    },
    async deleteDesign(id, customerId) {
      if (designRows.get(id)?.customer_id === customerId) designRows.delete(id)
    },
  }
}

function identityFetch(identityId, email = 'owner@example.test') {
  return async (url, options) => {
    assert.equal(String(url), 'https://identity.test/.netlify/identity/user')
    assert.equal(options.headers.authorization, 'Bearer preview-session-token')
    return Response.json({ id: identityId, email })
  }
}

function customerDesignHandler({ store = new MemoryStore(), repository, identityId = 'identity-owner', email, fetchImpl, now } = {}) {
  requestHandler = createVercelDesignsHandler({
    store,
    customerRepository: repository,
    env: { NETLIFY_IDENTITY_URL: 'https://identity.test/.netlify/identity' },
    fetchImpl: fetchImpl || identityFetch(identityId, email),
    now,
  })
  const handler = requestHandler
  return { store, request: (operation, body = {}) => vercelRequest(vercelDesignRequest(operation, body, 'POST', { cookie: 'nf_jwt=preview-session-token' }), handler) }
}

test('authenticated Vercel designs map Identity to a server-selected profile and support cross-device design operations', async () => {
  const profileA = { id: 'customer-a', netlify_identity_id: 'identity-owner' }
  const profileB = { id: 'customer-b', netlify_identity_id: 'identity-other' }
  const repository = metadataRepository([profileA, profileB])
  const store = new MemoryStore()
  const owner = customerDesignHandler({ store, repository })
  const config = structuredClone(defaults)

  let response = await owner.request('save', { name: 'Owned design', config, customer_id: profileB.id })
  let payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(repository.designRows.get(payload.design.id).customer_id, profileA.id)
  assert.equal(repository.designRows.get(payload.design.id).storage_reference, `design:${payload.design.id}`)
  assert.deepEqual(repository.designRows.get(payload.design.id).design_configuration, config)

  response = await owner.request('list')
  payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.designs.length, 1)
  assert.equal(payload.designs[0].customerOwned, true)
  assert.deepEqual(payload.designs[0].config, config)
  assert.equal('ownerSecret' in payload.designs[0], false)

  const id = payload.designs[0].id
  response = await owner.request('load', { id })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).design.config, config)

  const changed = { ...config, width: 1250, availableWidth: 1400 }
  response = await owner.request('save', { id, name: 'Updated design', config: changed })
  assert.equal(response.status, 200)
  assert.equal(repository.designRows.get(id).design_name, 'Updated design')
  assert.equal(repository.designRows.get(id).design_configuration.width, 1250)

  response = await owner.request('rename', { id, name: 'Renamed design' })
  assert.equal(response.status, 200)
  assert.equal(repository.designRows.get(id).design_name, 'Renamed design')

  response = await owner.request('duplicate', { id })
  const duplicate = await response.json()
  assert.equal(response.status, 200)
  assert.equal(repository.designRows.get(duplicate.design.id).customer_id, profileA.id)

  response = await owner.request('share', { id })
  const shared = await response.json()
  assert.equal(response.status, 200)
  assert.equal(repository.designRows.get(id).share_token_hash, createHash('sha256').update(shared.token).digest('hex'))

  response = await owner.request('revoke', { id })
  assert.equal(response.status, 200)
  assert.equal(repository.designRows.get(id).share_token_hash, null)

  response = await owner.request('delete', { id: duplicate.design.id })
  assert.equal(response.status, 200)
  assert.equal(repository.designRows.has(duplicate.design.id), false)
  assert.equal(store.values.has(`design:${duplicate.design.id}`), false)
})

test('a different authenticated customer cannot operate on another profile design even with its owner secret', async () => {
  const profiles = [
    { id: 'customer-a', netlify_identity_id: 'identity-a' },
    { id: 'customer-b', netlify_identity_id: 'identity-b' },
  ]
  const repository = metadataRepository(profiles)
  const store = new MemoryStore()
  const firstCustomer = customerDesignHandler({ store, repository, identityId: 'identity-a', email: 'a@example.test' })
  const savedResponse = await firstCustomer.request('save', { name: 'Private', config: structuredClone(defaults) })
  const saved = await savedResponse.json()

  const otherCustomer = customerDesignHandler({
    store,
    repository,
    identityId: 'identity-b',
    email: 'b@example.test',
  })
  let response = await otherCustomer.request('save', {
    id: saved.design.id,
    ownerSecret: saved.ownerSecret,
    name: 'Stolen update',
    config: { ...structuredClone(defaults), width: 1350, availableWidth: 1450 },
  })
  assert.equal(response.status, 404)
  response = await otherCustomer.request('delete', { id: saved.design.id, ownerSecret: saved.ownerSecret })
  assert.equal(response.status, 404)
  assert.equal(repository.designRows.get(saved.design.id).customer_id, 'customer-a')
  assert.equal((await firstCustomer.request('load', { id: saved.design.id })).status, 200)
})

test('metadata failure compensates a newly created Blob without exposing provider details', async () => {
  const store = new MemoryStore()
  const profile = { id: 'customer-a', netlify_identity_id: 'identity-owner' }
  const repository = metadataRepository([profile])
  repository.saveDesign = async () => { throw new Error('secret provider response must not escape') }
  const owner = customerDesignHandler({ store, repository })
  const response = await owner.request('save', { name: 'Retryable', config: structuredClone(defaults) })
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'Design storage is temporarily unavailable.' })
  assert.equal(store.values.size, 0)
  assert.equal(repository.designRows.size, 0)
})

test('a failed metadata update leaves the Blob intact and a retry repairs its metadata', async () => {
  const store = new MemoryStore()
  const repository = metadataRepository([{ id: 'customer-a', netlify_identity_id: 'identity-owner' }])
  const owner = customerDesignHandler({ store, repository })
  const config = structuredClone(defaults)
  const first = await owner.request('save', { name: 'Before update', config })
  const saved = await first.json()
  const id = saved.design.id
  let failUpdate = true
  const saveMetadata = repository.saveDesign
  repository.saveDesign = async (row) => {
    if (failUpdate && repository.designRows.has(row.id)) throw new Error('synthetic metadata outage')
    return saveMetadata(row)
  }

  const updatedConfig = { ...config, width: 1280, availableWidth: 1450 }
  let response = await owner.request('save', { id, name: 'After update', config: updatedConfig })
  assert.equal(response.status, 503)
  assert.equal((await store.get(`design:${id}`, { type: 'json' })).config.width, 1280)
  assert.equal(repository.designRows.get(id).design_configuration.width, config.width)

  failUpdate = false
  response = await owner.request('save', { id, name: 'After update', config: updatedConfig })
  assert.equal(response.status, 200)
  assert.equal(repository.designRows.get(id).design_configuration.width, 1280)
  assert.equal(repository.designRows.get(id).design_name, 'After update')
})

test('a Blob delete followed by a Supabase failure can be retried to clean metadata', async () => {
  const store = new MemoryStore()
  const repository = metadataRepository([{ id: 'customer-a', netlify_identity_id: 'identity-owner' }])
  const owner = customerDesignHandler({ store, repository })
  const first = await owner.request('save', { name: 'Delete retry', config: structuredClone(defaults) })
  const saved = await first.json()
  const id = saved.design.id
  let failDelete = true
  const deleteMetadata = repository.deleteDesign
  repository.deleteDesign = async (...args) => {
    if (failDelete) throw new Error('synthetic metadata outage')
    return deleteMetadata(...args)
  }

  let response = await owner.request('delete', { id })
  assert.equal(response.status, 503)
  assert.equal(await store.get(`design:${id}`, { type: 'json' }), null)
  assert.equal(repository.designRows.has(id), true)

  failDelete = false
  response = await owner.request('delete', { id })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { deleted: true })
  assert.equal(repository.designRows.has(id), false)
})

test('legacy designs remain owner-secret accessible and are linked only after verified ownership', async () => {
  const store = new MemoryStore()
  const legacyHandler = createDesignHandler({ store })
  const config = structuredClone(defaults)
  const legacy = await call(legacyHandler, 'save', { name: 'Legacy', config })
  const legacyId = legacy.data.design.id
  const repository = metadataRepository([{ id: 'customer-a', netlify_identity_id: 'identity-owner' }])
  const owner = customerDesignHandler({ store, repository })

  let response = await owner.request('load', { id: legacyId, ownerSecret: legacy.data.ownerSecret })
  assert.equal(response.status, 200)
  assert.equal(repository.designRows.get(legacyId).legacy_design_id, legacyId)

  response = await owner.request('rename', { id: legacyId, name: 'Linked legacy' })
  assert.equal(response.status, 200)
  assert.equal(repository.designRows.get(legacyId).customer_id, 'customer-a')
  assert.equal(repository.designRows.get(legacyId).legacy_design_id, legacyId)
})
