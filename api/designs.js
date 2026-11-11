import { Readable } from 'node:stream'
import { getStore } from '@netlify/blobs'
import { createDesignHandler } from '../netlify/functions/lib/design-storage.mjs'
import { createSupabaseCustomerRepository } from './lib/supabase-customers.js'

const DESIGN_STORE_NAME = 'bharadwaj-mandir-designs'
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
}

function safeProviderCode(value) {
  if (typeof value !== 'string') return undefined
  const knownCodes = new Set([
    'invalid_token', 'invalid_grant', 'invalid_credentials', 'user_not_found', 'email_not_confirmed',
    'ETIMEDOUT', 'ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT',
  ])
  if (knownCodes.has(value) || /^[0-9A-Z]{5}$/.test(value) || /^PGRST\d{3}$/.test(value) || /^BLOBS_[A-Z0-9_]{1,32}$/.test(value)) return value
  return undefined
}

async function getProviderCode(response) {
  try { return safeProviderCode((await response.clone().json())?.code) } catch { return undefined }
}

function logDesignFailure(logger, { stage, category, status, providerCode } = {}) {
  const details = { stage, category }
  if (Number.isInteger(status) && status >= 100 && status <= 599) details.status = status
  const safeCode = safeProviderCode(providerCode)
  if (safeCode) details.providerCode = safeCode
  try { logger.error?.('Vercel design operation failed.', details) } catch { /* Logging must not change request behavior. */ }
}

function classifyError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError' || ['ETIMEDOUT', 'ECONNABORTED'].includes(error?.code)) return 'timeout'
  if (error?.code && /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(error.code)) return 'provider_error'
  return 'network_error'
}

function writeJson(response, status, payload) {
  response.statusCode = status
  for (const [name, value] of Object.entries(JSON_HEADERS)) response.setHeader(name, value)
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

function getClientAddress(request) {
  const realIp = getRequestHeader(request, 'x-real-ip')
  if (realIp) return String(realIp).trim()
  return String(getRequestHeader(request, 'x-forwarded-for') || 'unknown').split(',')[0].trim()
}

function getIdentityUrl(value) {
  if (!value) throw new Error('Netlify Identity configuration is incomplete.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.replace(/\/$/, '').endsWith('/.netlify/identity')) throw new Error('Netlify Identity configuration is invalid.')
  return url.href.replace(/\/$/, '')
}

export function createVercelDesignHandler({ env = process.env, getStoreFn = getStore, store, customerRepository, fetchImpl = fetch, identityUrl, logger = console } = {}) {
  let designStore = store
  if (!designStore) {
    const siteID = env.NETLIFY_BLOBS_SITE_ID?.trim()
    const token = env.NETLIFY_BLOBS_TOKEN?.trim()
    if (!siteID || !token) throw new Error('Design storage configuration is incomplete.')
    designStore = getStoreFn(DESIGN_STORE_NAME, { siteID, token })
  }
  let customerAccess = null
  const hasSupabaseSetting = Boolean(env.SUPABASE_URL?.trim() || env.SUPABASE_SECRET_KEY?.trim())
  if (hasSupabaseSetting && (!env.SUPABASE_URL?.trim() || !env.SUPABASE_SECRET_KEY?.trim())) throw new Error('Supabase customer storage configuration is incomplete.')
  if (customerRepository || (env.SUPABASE_URL?.trim() && env.SUPABASE_SECRET_KEY?.trim())) {
    const repository = customerRepository || createSupabaseCustomerRepository({
      env,
      fetchImpl,
      onError: (details) => logDesignFailure(logger, details),
    })
    const identityEndpoint = getIdentityUrl(identityUrl || env.NETLIFY_IDENTITY_URL)
    customerAccess = {
      repository,
      async getCustomer(request) {
        const cookie = request.headers.get('cookie') || ''
        const cookieValue = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('nf_jwt='))
        if (!cookieValue) {
          logDesignFailure(logger, { stage: 'netlify_identity_authentication', category: 'missing_session' })
          return null
        }
        let jwt = cookieValue.slice('nf_jwt='.length)
        try { jwt = decodeURIComponent(jwt) } catch { /* Netlify Identity may use a raw cookie token. */ }
        let response
        let user
        try {
          response = await fetchImpl(`${identityEndpoint}/user`, {
            headers: { authorization: `Bearer ${jwt}` },
            signal: AbortSignal.timeout(5_000),
          })
          if (!response.ok) {
            logDesignFailure(logger, {
              stage: 'netlify_identity_authentication',
              category: 'identity_rejected',
              status: response.status,
              providerCode: await getProviderCode(response),
            })
            return null
          }
          try { user = await response.json() } catch {
            logDesignFailure(logger, { stage: 'netlify_identity_authentication', category: 'invalid_identity_response', status: response.status })
            return null
          }
        } catch (error) {
          logDesignFailure(logger, { stage: 'netlify_identity_authentication', category: classifyError(error), providerCode: error?.code })
          return null
        }
        if (!user?.id || !user?.email) {
          logDesignFailure(logger, { stage: 'netlify_identity_authentication', category: 'invalid_identity_response', status: response.status })
          return null
        }
        const metadata = user.user_metadata || {}
        return repository.upsertProfile({
          identityId: user.id,
          fullName: metadata.full_name || user.name || '',
          email: user.email,
          phone: metadata.phone || '',
          contactConsent: metadata.contact_consent === true,
        })
      },
    }
  }
  return createDesignHandler({
    store: designStore,
    customerAccess,
    onDiagnostic: ({ stage, error }) => logDesignFailure(logger, {
      stage,
      category: classifyError(error),
      status: error?.status ?? error?.statusCode,
      providerCode: error?.code,
    }),
  })
}

let productionHandler
function getProductionHandler() {
  if (!productionHandler) {
    const required = ['NETLIFY_BLOBS_SITE_ID', 'NETLIFY_BLOBS_TOKEN', 'NETLIFY_IDENTITY_URL', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY']
    const missing = required.filter((name) => !process.env[name]?.trim())
    if (missing.length) throw new Error('Design customer storage configuration is incomplete.')
    productionHandler = createVercelDesignHandler()
  }
  return productionHandler
}

export function createVercelDesignNodeHandler({ getHandler = getProductionHandler, logger = console } = {}) {
  return async function designStorageVercelFunction(request, response) {
    let webRequest
    try {
      webRequest = toWebRequest(request)
    } catch {
      writeJson(response, 400, { error: 'The design request could not be read.' })
      return
    }

    try {
      const webResponse = await getHandler()(webRequest, { ip: getClientAddress(request) })
      response.statusCode = webResponse.status
      for (const [name, value] of webResponse.headers.entries()) response.setHeader(name, value)
      response.end(await webResponse.text())
    } catch {
      logDesignFailure(logger, { stage: 'vercel_design_handler', category: 'internal_error' })
      writeJson(response, 503, { error: 'Design storage is temporarily unavailable.' })
    }
  }
}

export default createVercelDesignNodeHandler()
