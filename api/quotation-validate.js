import { Readable } from 'node:stream'
import netlifyQuotationValidate from '../netlify/functions/quotation-validate.mjs'

const responseHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function writeJson(response, status, payload) {
  response.statusCode = status
  response.setHeader('content-type', responseHeaders['content-type'])
  response.setHeader('cache-control', responseHeaders['cache-control'])
  response.end(JSON.stringify(payload))
}

function toWebRequest(request) {
  const nodeHeaders = request.headers || {}
  const headerValue = (name) => {
    const value = nodeHeaders[name] ?? nodeHeaders[name.toLowerCase()]
    return Array.isArray(value) ? value[0] : value
  }
  const headers = new Headers()
  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (value === undefined || ['connection', 'host', 'transfer-encoding'].includes(name.toLowerCase())) continue
    headers.set(name, Array.isArray(value) ? value.join(', ') : String(value))
  }

  const method = String(request.method || 'GET').toUpperCase()
  const protocol = String(headerValue('x-forwarded-proto') || 'https').split(',')[0].trim()
  const host = String(headerValue('x-forwarded-host') || headerValue('host') || 'localhost').split(',')[0].trim()
  const url = new URL(request.url || '/', `${protocol}://${host}`)
  const init = { method, headers }
  if (!['GET', 'HEAD'].includes(method)) {
    init.body = Readable.toWeb(request)
    init.duplex = 'half'
  }
  return new Request(url, init)
}

export function createVercelQuotationValidateHandler({ quotationHandler = netlifyQuotationValidate } = {}) {
  return async function quotationValidateNodeHandler(request, response) {
    let webRequest
    try {
      webRequest = toWebRequest(request)
    } catch {
      writeJson(response, 400, { error: 'The quotation request could not be validated.' })
      return
    }

    try {
      const webResponse = await quotationHandler(webRequest)
      response.statusCode = webResponse.status
      for (const [name, value] of webResponse.headers.entries()) response.setHeader(name, value)
      response.end(await webResponse.text())
    } catch {
      writeJson(response, 500, { error: 'The quotation request could not be validated.' })
    }
  }
}

export default createVercelQuotationValidateHandler()
