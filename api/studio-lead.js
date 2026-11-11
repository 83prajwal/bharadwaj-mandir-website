import { AsyncLocalStorage } from 'node:async_hooks'
import { Readable } from 'node:stream'
import { getStore } from '@netlify/blobs'
import { createStudioLeadHandler } from '../netlify/functions/lib/studio-leads.mjs'

const REQUEST_TIMEOUT_MS = 5_000
const identityRequestContext = new AsyncLocalStorage()
const REQUIRED_STUDIO_LEAD_CONFIG = ['NETLIFY_BLOBS_SITE_ID', 'NETLIFY_BLOBS_TOKEN', 'NETLIFY_IDENTITY_URL']

function writeJson(response, status, payload) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(payload))
}

function getRequestHeader(request, name) {
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
  const protocol = String(getRequestHeader(request, 'x-forwarded-proto') || 'https').split(',')[0].trim()
  const host = String(getRequestHeader(request, 'x-forwarded-host') || getRequestHeader(request, 'host') || 'localhost').split(',')[0].trim()
  const url = new URL(request.url || '/', `${protocol}://${host}`)
  const init = { method, headers }
  if (!['GET', 'HEAD'].includes(method)) {
    init.body = Readable.toWeb(request)
    init.duplex = 'half'
  }
  return new Request(url, init)
}

function getIdentityUrl(value = process.env.NETLIFY_IDENTITY_URL) {
  if (!value) throw new Error('Studio lead Identity configuration is missing.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Studio lead Identity configuration is invalid.')
  }
  url.pathname = url.pathname.replace(/\/$/, '')
  if (!url.pathname.endsWith('/.netlify/identity')) throw new Error('Studio lead Identity configuration is invalid.')
  return url.href.replace(/\/$/, '')
}

function identityError(payload, status) {
  const error = new Error(typeof payload?.msg === 'string' ? payload.msg : `Identity request failed (${status}).`)
  error.status = status
  return error
}

async function identityFetch(path, options = {}, { fetchImpl = fetch, identityUrl = getIdentityUrl() } = {}) {
  return fetchImpl(`${identityUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

async function createNetlifyIdentityAccount(email, password, data, options) {
  const response = await identityFetch('/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, data }),
  }, options)
  let payload
  try { payload = await response.json() } catch { throw new Error('Identity returned an unreadable response.') }
  if (!response.ok) throw identityError(payload, response.status)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Identity returned an unreadable response.')
  return { confirmedAt: payload?.confirmed_at || null }
}

function getIdentityJwt(request) {
  const cookie = request?.headers?.get('cookie') || ''
  const part = cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith('nf_jwt='))
  if (!part) return null
  try { return decodeURIComponent(part.slice('nf_jwt='.length)) } catch { return part.slice('nf_jwt='.length) }
}

async function getNetlifyIdentityUser(options) {
  const request = identityRequestContext.getStore()
  const token = getIdentityJwt(request)
  if (!token) return null
  try {
    const response = await identityFetch('/user', {
      headers: { authorization: `Bearer ${token}` },
    }, options)
    if (!response.ok) return null
    const payload = await response.json()
    if (!payload?.email) return null
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name || payload.user_metadata?.full_name || '',
      userMetadata: payload.user_metadata || {},
      confirmedAt: payload.confirmed_at || null,
    }
  } catch {
    return null
  }
}

export function createVercelStudioLeadHandler({
  store,
  createAccount,
  currentUser,
  appendRow,
  fetchImpl = fetch,
  identityUrl,
  logger = console,
  env = process.env,
  getStoreFn = getStore,
} = {}) {
  const identityOptions = { fetchImpl, ...(identityUrl ? { identityUrl: getIdentityUrl(identityUrl) } : {}) }
  const storeOrThrow = store || getStoreFn('bharadwaj-mandir-studio-leads', {
    siteID: env.NETLIFY_BLOBS_SITE_ID?.trim(),
    token: env.NETLIFY_BLOBS_TOKEN?.trim(),
  })
  const handler = createStudioLeadHandler({
    store: storeOrThrow,
    createAccount: createAccount || ((...args) => createNetlifyIdentityAccount(...args, identityOptions)),
    currentUser: currentUser || (() => getNetlifyIdentityUser(identityOptions)),
    ...(appendRow ? { appendRow } : {}),
  })

  return async function handleStudioLead(request, context = {}) {
    return identityRequestContext.run(request, () => handler(request, context))
  }
}

let productionHandler
export function getMissingStudioLeadConfiguration(env = process.env) {
  return REQUIRED_STUDIO_LEAD_CONFIG.filter((name) => !env[name]?.trim())
}

function getProductionHandler() {
  if (productionHandler) return productionHandler
  const missing = getMissingStudioLeadConfiguration()
  if (missing.length) {
    const error = new Error('Studio lead service configuration is incomplete.')
    error.code = 'STUDIO_LEAD_CONFIG_MISSING'
    error.missingVariables = missing
    throw error
  }
  productionHandler = createVercelStudioLeadHandler()
  return productionHandler
}

function getClientAddress(request) {
  const realIp = getRequestHeader(request, 'x-real-ip')
  if (realIp) return String(realIp).trim()
  return String(getRequestHeader(request, 'x-forwarded-for') || 'unknown').split(',')[0].trim()
}

export function createVercelStudioLeadNodeHandler({ getHandler = getProductionHandler, logger = console } = {}) {
  return async function studioLeadVercelFunction(request, response) {
    let webRequest
    try {
      webRequest = toWebRequest(request)
    } catch {
      writeJson(response, 400, { error: 'The request could not be read.' })
      return
    }

    let failureStage = 'handler_initialization'
    try {
      const handler = getHandler()
      failureStage = 'shared_handler'
      const result = await handler(webRequest, { ip: getClientAddress(request) })
      failureStage = 'response_transfer'
      response.statusCode = result.status
      for (const [name, value] of result.headers.entries()) response.setHeader(name, value)
      response.end(await result.text())
    } catch (error) {
      const diagnostic = { stage: failureStage }
      if (error?.code === 'STUDIO_LEAD_CONFIG_MISSING' && Array.isArray(error.missingVariables)) {
        diagnostic.missingVariables = error.missingVariables.filter((name) => REQUIRED_STUDIO_LEAD_CONFIG.includes(name))
      }
      logger.error?.('Studio lead Vercel adapter failed.', diagnostic)
      writeJson(response, 503, { error: 'The service is temporarily unavailable.' })
    }
  }
}

export default createVercelStudioLeadNodeHandler()
