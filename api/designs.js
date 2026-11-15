import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { getStore } from '@netlify/blobs'
import { createSupabaseCustomerRepository } from '../server/lib/supabase-customers.js'
import { createDesignHandler, SERVER_AUTHORIZED_DESIGN_ID } from '../netlify/functions/lib/design-storage.mjs'

const STORE_NAME = 'bharadwaj-mandir-designs'
const DESIGN_BODY_LIMIT = 40_000
const IDENTITY_TIMEOUT_MS = 5_000
const RATE_LIMIT = 40
const RATE_WINDOW_MS = 60_000
const DESIGN_ID_PATTERN = /^[0-9a-f-]{36}$/
const hash = (value) => createHash('sha256').update(value).digest('hex')

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  })
}

function sameOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try { return new URL(origin).origin === new URL(request.url).origin } catch { return false }
}

async function readRequestBody(request) {
  if (request.method !== 'POST' || !(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return null
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > DESIGN_BODY_LIMIT) return null
  const reader = request.clone().body?.getReader()
  if (!reader) return {}
  const chunks = []
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > DESIGN_BODY_LIMIT) {
        await reader.cancel()
        return null
      }
      chunks.push(Buffer.from(value))
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

function initializeStore(storeName, env, getStoreFn) {
  const siteID = env.NETLIFY_BLOBS_SITE_ID?.trim()
  const token = env.NETLIFY_BLOBS_TOKEN?.trim()
  if (!siteID || !token) throw new Error('Design storage configuration is unavailable.')
  return getStoreFn(storeName, { siteID, token })
}

function identityEndpoint(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Identity configuration is unavailable.')
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Identity configuration is invalid.')
  url.pathname = url.pathname.replace(/\/$/, '')
  if (!url.pathname.endsWith('/.netlify/identity')) throw new Error('Identity configuration is invalid.')
  return url.href.replace(/\/$/, '')
}

function identityToken(request) {
  const cookie = request.headers.get('cookie') || ''
  const pair = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('nf_jwt='))
  if (!pair) return null
  const value = pair.slice('nf_jwt='.length)
  try { return decodeURIComponent(value) } catch { return value }
}

async function verifyIdentityUser(request, { env, fetchImpl, currentUser }) {
  if (currentUser) return currentUser(request)
  const token = identityToken(request)
  if (!token) return null
  let response
  try {
    response = await fetchImpl(`${identityEndpoint(env.NETLIFY_IDENTITY_URL)}/user`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
    })
  } catch {
    throw new Error('Identity verification is temporarily unavailable.')
  }
  if (!response.ok) return null
  let user
  try { user = await response.json() } catch { throw new Error('Identity returned an unreadable response.') }
  if (!user || typeof user.id !== 'string' || typeof user.email !== 'string') return null
  return user
}

function toMetadata(record, customerId, { legacyDesignId = null, shareTokenHash = record.shareHash || null, shareExpiresAt = record.shareExpiresAt || null } = {}) {
  return {
    id: record.id,
    customer_id: customerId,
    legacy_design_id: legacyDesignId,
    design_name: record.name,
    design_configuration: record.config,
    storage_reference: `design:${record.id}`,
    share_token_hash: shareTokenHash,
    share_expires_at: shareExpiresAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

function designResponse(record) {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    hasShare: Boolean(record.shareHash),
    config: record.config,
    customerOwned: true,
  }
}

function makeOwnerContext(context, id) {
  return { ...context, [SERVER_AUTHORIZED_DESIGN_ID]: id }
}

function statusNotFound() {
  return json(404, { error: 'Saved design not found.' })
}

function safeUnavailable() {
  return json(503, { error: 'Design storage is temporarily unavailable.' })
}

export function createVercelDesignsHandler({
  env = process.env,
  getStoreFn = getStore,
  store: suppliedStore,
  customerRepository: suppliedRepository,
  fetchImpl = fetch,
  currentUser,
  now,
  metadataEnabled = true,
} = {}) {
  let store = suppliedStore
  let designHandler
  let customerRepository = suppliedRepository
  const rateWindows = new Map()

  const getBlobsStore = () => {
    if (!store) store = initializeStore(STORE_NAME, env, getStoreFn)
    return store
  }
  const getDesignHandler = () => {
    if (!designHandler) designHandler = createDesignHandler({ store: getBlobsStore(), now })
    return designHandler
  }
  const getCustomerRepository = () => {
    if (!customerRepository) customerRepository = createSupabaseCustomerRepository({ env, fetchImpl })
    return customerRepository
  }
  const loadBlobRecord = async (reference) => {
    if (typeof reference !== 'string' || !/^design:[0-9a-f-]{36}$/.test(reference)) return null
    return (await getBlobsStore().get(reference, { type: 'json' })) || null
  }
  const findCustomerDesign = async (repository, id, customerId) => {
    if (typeof id !== 'string' || !DESIGN_ID_PATTERN.test(id)) return { row: null, foreign: false }
    const row = await repository.findDesignById(id)
    return row
      ? { row: row.customer_id === customerId ? row : null, foreign: row.customer_id !== customerId }
      : { row: null, foreign: false }
  }
  const writeMetadata = async (repository, record, customerId, legacyDesignId, options) => {
    await repository.saveDesign(toMetadata(record, customerId, { legacyDesignId, ...options }))
  }
  const runBase = async (request, context, payload, authorizedId) => {
    const headers = new Headers({ 'content-type': 'application/json' })
    const origin = request.headers.get('origin')
    if (origin) headers.set('origin', origin)
    const delegatedRequest = payload
      ? new Request(request.url, { method: 'POST', headers, body: JSON.stringify(payload) })
      : request
    return getDesignHandler()(delegatedRequest, authorizedId ? makeOwnerContext(context, authorizedId) : context)
  }
  const getCustomerContext = async (request) => {
    const user = await verifyIdentityUser(request, { env, fetchImpl, currentUser })
    if (!user) return { response: json(401, { error: 'Please log in to manage saved designs.' }) }
    const repository = getCustomerRepository()
    const profile = await repository.findProfile(user.id)
    if (!profile || profile.netlify_identity_id !== user.id || typeof profile.id !== 'string') {
      return { response: json(403, { error: 'The customer profile is unavailable for this account.' }) }
    }
    return { user, profile, repository }
  }
  const rateLimitList = (ip) => {
    const nowMs = Date.now()
    const window = Math.floor(nowMs / RATE_WINDOW_MS)
    const entry = rateWindows.get(ip)
    if (entry?.window === window && entry.count >= RATE_LIMIT) return true
    rateWindows.set(ip, { window, count: entry?.window === window ? entry.count + 1 : 1 })
    if (rateWindows.size > 1000) {
      for (const [key, value] of rateWindows) if (value.window < window - 1) rateWindows.delete(key)
    }
    return false
  }

  return async function handleVercelDesigns(request, context = {}) {
    try {
      if (!['GET', 'POST'].includes(request.method)) return getDesignHandler()(request, context)
      if (!sameOrigin(request)) return getDesignHandler()(request, context)
      const body = await readRequestBody(request)
      if (body === null) return getDesignHandler()(request, context)
      const url = new URL(request.url)
      const operation = request.method === 'POST' ? body?.operation : url.searchParams.get('operation')
      if (operation === 'read-share') return getDesignHandler()(request, context)
      if (request.method !== 'POST' || !['list', 'save', 'load', 'rename', 'duplicate', 'delete', 'share', 'revoke'].includes(operation)) {
        return getDesignHandler()(request, context)
      }

      if (metadataEnabled === false) return getDesignHandler()(request, context)

      if (rateLimitList(context.ip || 'unknown')) {
        return json(429, { error: 'Please wait before making more design changes.' })
      }

      let customer
      try { customer = await getCustomerContext(request) } catch {
        // Legacy owner-secret operations remain usable if Identity is unavailable.
        // A new design save still requires a verified customer profile.
        if (body?.ownerSecret && body?.id) return getDesignHandler()(request, context)
        if (operation === 'save' && !body?.id) return safeUnavailable()
        throw new Error('Customer authentication is unavailable.')
      }
      if (customer.response) {
        if (body?.ownerSecret && body?.id) return getDesignHandler()(request, context)
        if (operation === 'list') return customer.response
        if (operation === 'save' && !body?.id) return json(401, { error: 'Please log in to save designs to your account.' })
        return getDesignHandler()(request, context)
      }
      const { profile, repository } = customer

      if (operation === 'list') {
        const rows = await repository.listDesigns(profile.id)
        const designs = []
        for (const row of rows) {
          if (row.storage_reference !== `design:${row.id}`) continue
          const record = await loadBlobRecord(row.storage_reference)
          if (!record || record.id !== row.id) continue
          designs.push(designResponse(record))
        }
        return json(200, { designs })
      }

      const id = body?.id
      const metadata = await findCustomerDesign(repository, id, profile.id)
      if (metadata.foreign) return statusNotFound()

      if (operation === 'load' && metadata.row) {
        if (metadata.row.storage_reference !== `design:${id}`) return statusNotFound()
        const record = await loadBlobRecord(metadata.row.storage_reference)
        if (!record || record.id !== id) return statusNotFound()
        const { customerOwned: _customerOwned, ...design } = designResponse(record)
        return json(200, { design })
      }

      if (operation === 'delete' && metadata.row) {
        if (metadata.row.storage_reference !== `design:${id}`) return statusNotFound()
        const record = await loadBlobRecord(metadata.row.storage_reference)
        if (!record) {
          await repository.deleteDesign(id, profile.id)
          return json(200, { deleted: true })
        }
      }

      const authorizedId = metadata.row ? id : undefined
      const response = await runBase(request, { ...context, ip: context.ip || 'unknown' }, body, authorizedId)
      if (!response.ok) return response
      const result = await response.clone().json()

      if (operation === 'delete') {
        if (metadata.row) await repository.deleteDesign(id, profile.id)
        return response
      }

      if (operation === 'load') {
        // The shared handler has verified the legacy owner secret. Linking is
        // best effort so an unavailable metadata store cannot break that path.
        if (!metadata.row) {
          try {
            const record = await loadBlobRecord(`design:${id}`)
            if (record?.id === id) await writeMetadata(repository, record, profile.id, id)
          } catch { /* Keep the verified legacy design accessible and retry linking later. */ }
        }
        return response
      }

      if (operation === 'save' || operation === 'rename') {
        const savedId = result?.design?.id
        const record = savedId ? await loadBlobRecord(`design:${savedId}`) : null
        if (!record) return safeUnavailable()
        const legacyDesignId = metadata.row ? metadata.row.legacy_design_id : (id || null)
        try {
          await writeMetadata(repository, record, profile.id, legacyDesignId)
        } catch {
          if (!id && result.ownerSecret) {
            await runBase(request, { ...context, ip: context.ip || 'unknown' }, {
              operation: 'delete', id: savedId, ownerSecret: result.ownerSecret,
            }).catch(() => undefined)
          }
          return safeUnavailable()
        }
        return response
      }

      if (operation === 'duplicate') {
        const copyId = result?.design?.id
        const record = copyId ? await loadBlobRecord(`design:${copyId}`) : null
        if (!record) return safeUnavailable()
        try {
          await writeMetadata(repository, record, profile.id, null)
        } catch {
          if (result.ownerSecret) {
            await runBase(request, { ...context, ip: context.ip || 'unknown' }, {
              operation: 'delete', id: copyId, ownerSecret: result.ownerSecret,
            }).catch(() => undefined)
          }
          return safeUnavailable()
        }
        return response
      }

      if (operation === 'share' || operation === 'revoke') {
        const record = await loadBlobRecord(`design:${id}`)
        if (!record) return safeUnavailable()
        try {
          const shareTokenHash = operation === 'share' ? hash(result.token) : null
          const shareExpiresAt = operation === 'share' ? result.expiresAt : null
          await writeMetadata(repository, record, profile.id, metadata.row?.legacy_design_id || (metadata.row ? null : id), {
            shareTokenHash,
            shareExpiresAt,
          })
        } catch {
          return safeUnavailable()
        }
      }

      return response
    } catch {
      return safeUnavailable()
    }
  }
}

function getNodeHeader(request, name) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function toWebRequest(request) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers || {})) {
    if (value === undefined || ['connection', 'host', 'transfer-encoding'].includes(name.toLowerCase())) continue
    headers.set(name, Array.isArray(value) ? value.join(', ') : String(value))
  }
  const method = String(request.method || 'GET').toUpperCase()
  const protocol = String(getNodeHeader(request, 'x-forwarded-proto') || 'https').split(',')[0].trim()
  const host = String(getNodeHeader(request, 'x-forwarded-host') || getNodeHeader(request, 'host') || 'localhost').split(',')[0].trim()
  const url = new URL(request.url || '/', `${protocol}://${host}`)
  const init = { method, headers }
  if (!['GET', 'HEAD'].includes(method)) {
    init.body = Readable.toWeb(request)
    init.duplex = 'half'
  }
  return new Request(url, init)
}

function clientAddress(request) {
  const realIp = getNodeHeader(request, 'x-real-ip')
  if (realIp) return String(realIp).trim()
  return String(getNodeHeader(request, 'x-forwarded-for') || 'unknown').split(',')[0].trim()
}

function writeJson(response, status, payload) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.setHeader('referrer-policy', 'no-referrer')
  response.end(JSON.stringify(payload))
}

export function createVercelDesignsNodeHandler({ designHandler = createVercelDesignsHandler() } = {}) {
  return async function designsVercelFunction(request, response) {
    let webRequest
    try { webRequest = toWebRequest(request) } catch {
      writeJson(response, 400, { error: 'The design request could not be read.' })
      return
    }
    try {
      const webResponse = await designHandler(webRequest, { ip: clientAddress(request) })
      response.statusCode = webResponse.status
      for (const [name, value] of webResponse.headers.entries()) response.setHeader(name, value)
      response.end(await webResponse.text())
    } catch {
      writeJson(response, 503, { error: 'Design storage is temporarily unavailable.' })
    }
  }
}

export default createVercelDesignsNodeHandler()
