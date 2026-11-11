import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { defaults } from '../src/pages/mandir-studio/lib/config.ts'
import { createVercelDesignHandler, createVercelDesignNodeHandler } from '../api/designs.js'
import { createSupabaseCustomerRepository } from '../api/lib/supabase-customers.js'

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
    logger: { error() {} },
  })
  response = makeNodeResponse()
  await missingCredentials(makeNodeRequest('load'), response)
  assert.equal(response.statusCode, 503)
  assert.deepEqual(JSON.parse(response.body), { error: 'Design storage is temporarily unavailable.' })
  assert.equal(response.body.includes('site-id'), false)
  assert.equal(response.body.includes('token'), false)
})

function customerRepository() {
  const profiles = new Map()
  const designs = new Map()
  return {
    profiles,
    designs,
    async upsertProfile(profile) {
      const row = profiles.get(profile.identityId) || { id: `customer-${profile.identityId}`, ...profile }
      Object.assign(row, profile)
      profiles.set(profile.identityId, row)
      return row
    },
    async findDesign(id, customerId) {
      const row = designs.get(id)
      return row?.customer_id === customerId ? row : null
    },
    async findDesignById(id) { return designs.get(id) || null },
    async listDesigns(customerId) { return [...designs.values()].filter((row) => row.customer_id === customerId) },
    async saveDesign(row) {
      const existing = designs.get(row.id)
      if (existing && existing.customer_id !== row.customer_id) throw Object.assign(new Error('design id conflict'), { status: 409 })
      const saved = { ...existing, ...row }
      designs.set(row.id, saved)
      return saved
    },
    async deleteDesign(id, customerId) {
      if (designs.get(id)?.customer_id === customerId) designs.delete(id)
    },
  }
}

function customerDesignHandler({ store, repository, logger = { error() {} } }) {
  const fetchImpl = async (_url, options) => {
    const token = options.headers.authorization.slice('Bearer '.length)
    const id = token === 'identity-a' ? 'netlify-user-a' : token === 'identity-b' ? 'netlify-user-b' : null
    return id ? Response.json({ id, email: `${id}@example.com`, user_metadata: { full_name: id, phone: '+919876543210', contact_consent: true } }) : new Response('', { status: 401 })
  }
  const handler = createVercelDesignHandler({
    env: {
      NETLIFY_BLOBS_SITE_ID: 'site-id', NETLIFY_BLOBS_TOKEN: 'blob-token',
      NETLIFY_IDENTITY_URL: 'https://identity.test/.netlify/identity',
      SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'server-key',
    },
    store,
    customerRepository: repository,
    fetchImpl,
    logger,
  })
  return createVercelDesignNodeHandler({ getHandler: () => handler, logger })
}

function diagnosticDesignHandler({ store, fetchImpl, logger }) {
  const handler = createVercelDesignHandler({
    env: {
      NETLIFY_BLOBS_SITE_ID: 'site-id', NETLIFY_BLOBS_TOKEN: 'blob-token',
      NETLIFY_IDENTITY_URL: 'https://identity.test/.netlify/identity',
      SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'server-key',
    },
    store,
    fetchImpl,
    logger,
  })
  return createVercelDesignNodeHandler({ getHandler: () => handler, logger })
}

test('customer designs use verified Netlify Identity, persist metadata idempotently and list across devices', async () => {
  const store = new MemoryStore()
  const repository = customerRepository()
  const handler = customerDesignHandler({ store, repository })
  const id = 'c51e7d70-0b2d-46da-bc7c-79bc8574f3e4'
  const options = { headers: { cookie: 'nf_jwt=identity-a' } }

  let result = await call(handler, 'save', { clientDesignId: id, name: 'Family mandir', config: structuredClone(defaults), customerId: 'forged-customer' }, options)
  assert.equal(result.response.statusCode, 200)
  assert.equal(result.data.design.id, id)
  assert.equal(result.data.design.customerOwned, true)
  assert.deepEqual(repository.profiles.get('netlify-user-a'), {
    id: 'customer-netlify-user-a', identityId: 'netlify-user-a', fullName: 'netlify-user-a',
    email: 'netlify-user-a@example.com', phone: '+919876543210', contactConsent: true,
  })
  assert.equal(repository.designs.size, 1)
  assert.equal(repository.designs.get(id).customer_id, 'customer-netlify-user-a')
  assert.deepEqual(JSON.parse(store.values.get(`design:${id}`)).config, defaults)

  // A retry with the same client-generated design ID updates one record.
  result = await call(handler, 'save', { clientDesignId: id, name: 'Family mandir', config: structuredClone(defaults) }, options)
  assert.equal(result.response.statusCode, 200)
  assert.equal(repository.designs.size, 1)

  // A new session/device can retrieve the server-owned list and load the design.
  result = await call(handler, 'list', {}, options)
  assert.equal(result.data.designs.length, 1)
  assert.equal(result.data.designs[0].id, id)
  result = await call(handler, 'load', { id }, options)
  assert.equal(result.response.statusCode, 200)
  assert.deepEqual(result.data.design.config, defaults)

  // Another Identity account cannot read, rename or delete this row.
  for (const operation of ['load', 'rename', 'delete']) {
    result = await call(handler, operation, { id, name: 'Stolen' }, { headers: { cookie: 'nf_jwt=identity-b' } })
    assert.equal(result.response.statusCode, 404, operation)
  }
  assert.equal(repository.designs.size, 1)
  assert.equal(JSON.parse(store.values.get(`design:${id}`)).name, 'Family mandir')
})

test('Identity authentication failures log only a safe stage, category, status and provider code', async () => {
  const logs = []
  const handler = diagnosticDesignHandler({
    store: new MemoryStore(),
    logger: { error: (...args) => logs.push(args) },
    fetchImpl: async () => Response.json({ code: 'invalid_token', message: 'private customer@example.com' }, { status: 401 }),
  })
  const result = await call(handler, 'save', {
    clientDesignId: '230ae006-5f61-4df2-99f3-026adca40d91',
    name: 'Private design', config: structuredClone(defaults),
  }, { headers: { cookie: 'nf_jwt=private-session-token' } })

  assert.equal(result.response.statusCode, 401)
  assert.deepEqual(logs, [[
    'Vercel design operation failed.',
    { stage: 'netlify_identity_authentication', category: 'identity_rejected', status: 401, providerCode: 'invalid_token' },
  ]])
  assert.doesNotMatch(JSON.stringify(logs), /private-session-token|customer@example\.com|Private design|requirements/)
})

test('Supabase customer-profile lookup failures return generic JSON and log no provider message', async () => {
  const logs = []
  const handler = diagnosticDesignHandler({
    store: new MemoryStore(),
    logger: { error: (...args) => logs.push(args) },
    fetchImpl: async (url) => {
      if (String(url).endsWith('/user')) return Response.json({ id: 'identity-1', email: 'private@example.com', user_metadata: {} })
      return Response.json({ code: 'PGRST999', message: 'private@example.com and private request details' }, { status: 503 })
    },
  })
  const result = await call(handler, 'save', {
    clientDesignId: '330ae006-5f61-4df2-99f3-026adca40d91',
    name: 'Private design', config: structuredClone(defaults),
  }, { headers: { cookie: 'nf_jwt=private-session-token' } })

  assert.equal(result.response.statusCode, 503)
  assert.deepEqual(result.data, { error: 'Design storage is temporarily unavailable.' })
  assert.deepEqual(logs, [[
    'Vercel design operation failed.',
    { stage: 'supabase_customer_profile_lookup', category: 'provider_http_error', status: 503, providerCode: 'PGRST999' },
  ]])
  assert.doesNotMatch(JSON.stringify(logs), /private-session-token|private@example\.com|private request details|Private design/)
  assert.doesNotMatch(JSON.stringify(result.data), /PGRST999|private@example\.com|private request details/)
})

test('Supabase saved-design metadata insertion failures return generic JSON and log safe provider details', async () => {
  const logs = []
  const handler = diagnosticDesignHandler({
    store: new MemoryStore(),
    logger: { error: (...args) => logs.push(args) },
    fetchImpl: async (url, options) => {
      const endpoint = String(url)
      if (endpoint.endsWith('/user')) return Response.json({ id: 'identity-1', email: 'private@example.com', user_metadata: {} })
      if (endpoint.includes('/customer_profiles?') && options.method === 'GET') return Response.json([])
      if (endpoint.includes('/customer_profiles?') && options.method === 'POST') return Response.json([{
        id: 'customer-1', netlify_identity_id: 'identity-1', full_name: '', email: 'private@example.com', phone: '', contact_consent: false,
      }], { status: 201 })
      if (endpoint.includes('/saved_designs?') && options.method === 'GET') return Response.json([])
      if (endpoint.includes('/saved_designs?') && options.method === 'POST') {
        return Response.json({ code: '23514', message: 'private design payload and customer@example.com' }, { status: 400 })
      }
      assert.fail(`Unexpected provider request: ${endpoint}`)
    },
  })
  const result = await call(handler, 'save', {
    clientDesignId: '430ae006-5f61-4df2-99f3-026adca40d91',
    name: 'Private design', config: structuredClone(defaults),
  }, { headers: { cookie: 'nf_jwt=private-session-token' } })

  assert.equal(result.response.statusCode, 400)
  assert.deepEqual(result.data, { error: 'Design storage is temporarily unavailable.' })
  assert.deepEqual(logs, [[
    'Vercel design operation failed.',
    { stage: 'supabase_saved_design_metadata_write', category: 'provider_http_error', status: 400, providerCode: '23514' },
  ]])
  assert.doesNotMatch(JSON.stringify(logs), /private-session-token|private@example\.com|customer@example\.com|private design payload|Private design/)
})

test('concurrent different customers cannot claim or overwrite the same design ID', async () => {
  const store = new MemoryStore()
  const repository = customerRepository()
  const originalFindById = repository.findDesignById.bind(repository)
  let arrived = 0
  let release
  const barrier = new Promise((resolve) => { release = resolve })
  repository.findDesignById = async (id) => {
    const snapshot = await originalFindById(id)
    arrived += 1
    if (arrived === 2) release()
    await barrier
    return snapshot
  }
  const handler = customerDesignHandler({ store, repository })
  const id = 'd1114b2e-f20b-41f7-8c0c-426dd6df134a'
  const save = (identity, name) => call(handler, 'save', {
    clientDesignId: id, name, config: structuredClone(defaults),
  }, { headers: { cookie: `nf_jwt=identity-${identity}` } })

  const results = await Promise.all([save('a', 'Customer A'), save('b', 'Customer B')])
  assert.deepEqual(results.map(({ response }) => response.statusCode).sort(), [200, 409])
  assert.equal(repository.designs.size, 1)
  const [ownedRow] = repository.designs.values()
  const storedBlob = JSON.parse(store.values.get(`design:${id}`))
  assert.equal(storedBlob.customerProfileId, ownedRow.customer_id)
  assert.ok(['customer-netlify-user-a', 'customer-netlify-user-b'].includes(ownedRow.customer_id))
})

test('legacy owner-secret designs are not auto-linked to a signed-in customer', async () => {
  const store = new MemoryStore()
  const repository = customerRepository()
  const legacyHandler = createVercelDesignNodeHandler({ getHandler: () => createVercelDesignHandler({ store }) })
  let result = await call(legacyHandler, 'save', { name: 'Legacy', config: structuredClone(defaults) })
  const { id, ownerSecret } = { ...result.data.design, ownerSecret: result.data.ownerSecret }

  const handler = customerDesignHandler({ store, repository })
  result = await call(handler, 'list', {}, { headers: { cookie: 'nf_jwt=identity-a' } })
  assert.deepEqual(result.data.designs, [])
  result = await call(handler, 'load', { id }, { headers: { cookie: 'nf_jwt=identity-a' } })
  assert.equal(result.response.statusCode, 404)
  result = await call(handler, 'load', { id, ownerSecret })
  assert.equal(result.response.statusCode, 200)
  assert.equal(repository.designs.size, 0)
  result = await call(handler, 'load', { id, ownerSecret }, { headers: { cookie: 'nf_jwt=identity-a' } })
  assert.equal(result.response.statusCode, 200)
  assert.equal(repository.designs.get(id).customer_id, 'customer-netlify-user-a')
  assert.equal(repository.designs.get(id).legacy_design_id, id)
})

test('a design save retry after a Blobs write failure recovers the claimed ID without creating a second design', async () => {
  const store = new MemoryStore()
  const repository = customerRepository()
  const logs = []
  const originalSet = store.set.bind(store)
  let failOnce = true
  store.set = async (...args) => {
    if (failOnce) {
      failOnce = false
      throw Object.assign(new Error('private token and private@example.com'), { code: 'BLOBS_WRITE_DENIED', statusCode: 503 })
    }
    return originalSet(...args)
  }
  const handler = customerDesignHandler({ store, repository, logger: { error: (...args) => logs.push(args) } })
  const id = 'b25e5b38-c31b-4fca-9e0f-529af68e2cc4'
  const options = { headers: { cookie: 'nf_jwt=identity-a' } }
  let result = await call(handler, 'save', { clientDesignId: id, name: 'Retryable', config: structuredClone(defaults) }, options)
  assert.equal(result.response.statusCode, 500)
  assert.deepEqual(result.data, { error: 'Design storage is temporarily unavailable.' })
  assert.equal(repository.designs.size, 1)
  assert.equal(store.values.has(`design:${id}`), false)
  assert.deepEqual(repository.designs.get(id).design_configuration, defaults)
  assert.deepEqual(logs, [[
    'Vercel design operation failed.',
    { stage: 'netlify_blobs_design_configuration_write', category: 'provider_error', status: 503, providerCode: 'BLOBS_WRITE_DENIED' },
  ]])
  assert.doesNotMatch(JSON.stringify(logs), /private token|private@example\.com|Retryable|requirements/)
  result = await call(handler, 'save', { clientDesignId: id, name: 'Retryable', config: structuredClone(defaults) }, options)
  assert.equal(result.response.statusCode, 200)
  assert.equal(repository.designs.size, 1)
  assert.equal(repository.designs.get(id).customer_id, 'customer-netlify-user-a')
  assert.ok(store.values.has(`design:${id}`))
})

test('customer-owned designs preserve rename, duplicate, share, revoke and delete operations', async () => {
  const store = new MemoryStore()
  const repository = customerRepository()
  const handler = customerDesignHandler({ store, repository })
  const auth = { headers: { cookie: 'nf_jwt=identity-a' } }
  let result = await call(handler, 'save', { clientDesignId: '4ab756e0-c1e0-4c4d-a248-8a510a0f2710', name: 'Original', config: structuredClone(defaults) }, auth)
  const id = result.data.design.id
  result = await call(handler, 'rename', { id, name: 'Renamed' }, auth)
  assert.equal(result.response.statusCode, 200)
  result = await call(handler, 'duplicate', { id }, auth)
  assert.equal(result.response.statusCode, 200)
  const duplicateId = result.data.design.id
  assert.equal(repository.designs.size, 2)
  const retryId = 'ef106727-867d-4a57-b7c8-a3cfc2f86d02'
  await call(handler, 'duplicate', { id, clientDesignId: retryId }, auth)
  await call(handler, 'duplicate', { id, clientDesignId: retryId }, auth)
  assert.equal(repository.designs.size, 3)
  result = await call(handler, 'share', { id }, auth)
  assert.equal(result.response.statusCode, 200)
  const shareToken = result.data.token
  assert.ok(repository.designs.get(id).share_token_hash)
  result = await call(handler, 'read-share', { token: shareToken })
  assert.equal(result.response.statusCode, 200)
  result = await call(handler, 'revoke', { id }, auth)
  assert.deepEqual(result.data, { revoked: true })
  assert.equal((await call(handler, 'read-share', { token: shareToken })).response.statusCode, 404)
  result = await call(handler, 'delete', { id }, auth)
  assert.deepEqual(result.data, { deleted: true })
  assert.equal(repository.designs.size, 2)
  assert.equal((await call(handler, 'load', { id: duplicateId }, auth)).response.statusCode, 200)
})

test('Supabase repository uses server-only credentials, upserts by Identity ID and returns safe database errors', async () => {
  const calls = []
  const repository = createSupabaseCustomerRepository({
    env: { SUPABASE_URL: 'https://project.supabase.co/', SUPABASE_SECRET_KEY: 'server-only-secret' },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      if (options.method === 'GET') return Response.json([])
      return Response.json([{ id: 'customer-uuid', netlify_identity_id: 'identity-id' }])
    },
  })
  const profile = await repository.upsertProfile({ identityId: 'identity-id', fullName: 'Asha', email: 'ASHA@example.com', phone: '+919876543210', contactConsent: true })
  assert.equal(profile.id, 'customer-uuid')
  assert.match(calls[0].url, /netlify_identity_id=eq.identity-id/)
  assert.equal(calls[0].options.headers.apikey, 'server-only-secret')
  assert.equal(calls[0].options.headers.authorization, undefined)
  assert.equal(calls[1].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    netlify_identity_id: 'identity-id', full_name: 'Asha', email: 'asha@example.com',
    phone: '+919876543210', contact_consent: true, updated_at: JSON.parse(calls[1].options.body).updated_at,
  })
  assert.doesNotMatch(JSON.stringify(profile), /server-only-secret/)

  const failing = createSupabaseCustomerRepository({
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'secret' },
    fetchImpl: async () => new Response('private db response', { status: 500 }),
  })
  await assert.rejects(failing.upsertProfile({ identityId: 'id' }), /HTTP 500/)
})

test('Supabase missing-profile recovery creates the profile using the verified Identity ID', async () => {
  const calls = []
  const repository = createSupabaseCustomerRepository({
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'server-only-secret' },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      if (options.method === 'GET') return Response.json([])
      return Response.json([{ id: 'customer-uuid', netlify_identity_id: 'verified-identity-id' }], { status: 201 })
    },
  })
  const profile = await repository.createProfileIfMissing({
    identityId: 'verified-identity-id', fullName: 'Verified Name', email: 'VERIFIED@example.com',
    phone: '+919876543210', contactConsent: true,
  })
  assert.equal(profile.id, 'customer-uuid')
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /netlify_identity_id=eq.verified-identity-id/)
  assert.equal(calls[1].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    netlify_identity_id: 'verified-identity-id', full_name: 'Verified Name', email: 'verified@example.com',
    phone: '+919876543210', contact_consent: true,
  })
})

test('Supabase missing-profile recovery never overwrites an existing profile', async () => {
  const existing = {
    id: 'customer-uuid', netlify_identity_id: 'identity-id', full_name: 'Original Name',
    email: 'asha@example.com', phone: '+919876543210', contact_consent: false,
  }
  const calls = []
  const repository = createSupabaseCustomerRepository({
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'server-only-secret' },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      if (options.method === 'GET') return Response.json([existing])
      assert.fail('An existing profile must not be written or overwritten')
    },
  })
  const profile = await repository.createProfileIfMissing({
    identityId: 'identity-id', fullName: 'Changed Name', email: 'changed@example.com',
    phone: '+910000000000', contactConsent: true,
  })
  assert.deepEqual(profile, existing)
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /netlify_identity_id=eq.identity-id/)
})

test('Supabase design creation handles a concurrent ID conflict without patching another customer row', async () => {
  const rows = new Map()
  const calls = []
  let createBarrierResolve
  let createArrivals = 0
  const createBarrier = new Promise((resolve) => { createBarrierResolve = resolve })
  let patchCalls = 0
  const repositoryA = createSupabaseCustomerRepository({
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'server-key' },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      if (options.method === 'POST') {
        const row = JSON.parse(options.body)
        createArrivals += 1
        if (createArrivals === 2) createBarrierResolve()
        await createBarrier
        if (rows.has(row.id)) return Response.json({ message: 'duplicate key' }, { status: 409 })
        rows.set(row.id, row)
        return Response.json([row], { status: 201 })
      }
      if (options.method === 'GET') {
        const query = new URL(url).searchParams
        const row = rows.get(query.get('id')?.replace('eq.', ''))
        return Response.json(row && row.customer_id === query.get('customer_id')?.replace('eq.', '') ? [row] : [])
      }
      if (options.method === 'PATCH') {
        patchCalls += 1
        const query = new URL(url).searchParams
        const row = rows.get(query.get('id')?.replace('eq.', ''))
        if (!row || row.customer_id !== query.get('customer_id')?.replace('eq.', '')) return Response.json([])
        const updated = { ...row, ...JSON.parse(options.body) }
        rows.set(updated.id, updated)
        return Response.json([updated])
      }
      return Response.json([], { status: 200 })
    },
  })
  const id = '68ad591f-4b14-4d1e-9fdd-4e031fb64704'
  const base = {
    id, legacy_design_id: null, design_name: 'Design', design_configuration: defaults,
    storage_reference: `netlify-blobs://bharadwaj-mandir-designs/design:${id}`,
    share_token_hash: null, share_expires_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  const results = await Promise.all([
    repositoryA.saveDesign({ ...base, customer_id: 'customer-a' }),
    repositoryA.saveDesign({ ...base, customer_id: 'customer-b' }).then((row) => ({ row }), (error) => ({ error })),
  ])
  assert.equal(rows.size, 1)
  assert.equal(patchCalls, 0)
  assert.ok(['customer-a', 'customer-b'].includes(rows.get(id).customer_id))
  assert.equal(results.filter((value) => value?.error?.status === 409).length, 1)
  const owner = rows.get(id).customer_id
  await repositoryA.saveDesign({ ...rows.get(id), design_name: 'Updated by owner' })
  assert.equal(patchCalls, 1)
  const patchCall = calls.find((call) => call.options.method === 'PATCH')
  assert.match(patchCall.url, new RegExp(`id=eq.${id}.*customer_id=eq.${owner}`))
  assert.equal(Object.hasOwn(JSON.parse(patchCall.options.body), 'customer_id'), false)
  const otherCustomer = owner === 'customer-a' ? 'customer-b' : 'customer-a'
  await assert.rejects(repositoryA.saveDesign({ ...rows.get(id), customer_id: otherCustomer }), { status: 409 })
  assert.equal(patchCalls, 1)
  assert.equal(rows.get(id).customer_id, owner)
})
