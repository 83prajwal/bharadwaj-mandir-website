import { Readable } from 'node:stream'
import { getStore } from '@netlify/blobs'
import { createDesignHandler } from '../netlify/functions/lib/design-storage.mjs'

const DESIGN_STORE_NAME = 'bharadwaj-mandir-designs'
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
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

export function createVercelDesignHandler({ env = process.env, getStoreFn = getStore, store } = {}) {
  let designStore = store
  if (!designStore) {
    const siteID = env.NETLIFY_BLOBS_SITE_ID?.trim()
    const token = env.NETLIFY_BLOBS_TOKEN?.trim()
    if (!siteID || !token) throw new Error('Design storage configuration is incomplete.')
    designStore = getStoreFn(DESIGN_STORE_NAME, { siteID, token })
  }
  return createDesignHandler({ store: designStore })
}

let productionHandler
function getProductionHandler() {
  if (!productionHandler) productionHandler = createVercelDesignHandler()
  return productionHandler
}

export function createVercelDesignNodeHandler({ getHandler = getProductionHandler } = {}) {
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
      writeJson(response, 503, { error: 'Design storage is temporarily unavailable.' })
    }
  }
}

export default createVercelDesignNodeHandler()
