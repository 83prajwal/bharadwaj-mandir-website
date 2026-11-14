import { Readable } from 'node:stream'
import { getStore } from '@netlify/blobs'
import { createDesignHandler } from '../netlify/functions/lib/design-storage.mjs'

const STORE_NAME = 'bharadwaj-mandir-designs'
const REQUIRED_ENV = ['NETLIFY_BLOBS_SITE_ID', 'NETLIFY_BLOBS_TOKEN']

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function createConfiguredDesignHandler({ env, getStoreFn, store, now }) {
  if (store) return createDesignHandler({ store, now })

  const siteID = env.NETLIFY_BLOBS_SITE_ID?.trim()
  const token = env.NETLIFY_BLOBS_TOKEN?.trim()
  if (!siteID || !token) throw new Error('Design storage configuration is missing.')

  const blobsStore = getStoreFn(STORE_NAME, { siteID, token })
  return createDesignHandler({ store: blobsStore, now })
}

export function createVercelDesignsHandler({
  env = process.env,
  getStoreFn = getStore,
  store,
  now,
} = {}) {
  let handler
  return async function handleVercelDesigns(request, context = {}) {
    try {
      handler ||= createConfiguredDesignHandler({ env, getStoreFn, store, now })
      return await handler(request, context)
    } catch {
      return json(503, { error: 'Design storage is temporarily unavailable.' })
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
  response.end(JSON.stringify(payload))
}

export function createVercelDesignsNodeHandler({ designHandler = createVercelDesignsHandler() } = {}) {
  return async function designsVercelFunction(request, response) {
    let webRequest
    try {
      webRequest = toWebRequest(request)
    } catch {
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

export function getMissingDesignStorageConfiguration(env = process.env) {
  return REQUIRED_ENV.filter((name) => !env[name]?.trim())
}

export default createVercelDesignsNodeHandler()
