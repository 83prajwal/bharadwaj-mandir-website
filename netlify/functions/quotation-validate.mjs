import { MAX_QUOTE_BODY_BYTES, validateQuotationRequest } from './lib/quotation-request.mjs'

export default async function handler(request) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' }
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: { ...headers, Allow: 'POST' } })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return new Response(JSON.stringify({ error: 'Request origin is not allowed.' }), { status: 403, headers })
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > MAX_QUOTE_BODY_BYTES) return new Response(JSON.stringify({ error: 'The request is too large. Reduce the reference file size.' }), { status: 413, headers })
  try {
    const bytes = await request.arrayBuffer()
    if (bytes.byteLength > MAX_QUOTE_BODY_BYTES) return new Response(JSON.stringify({ error: 'The request is too large. Reduce the reference file size.' }), { status: 413, headers })
    const form = await new Request(request.url, { method: 'POST', headers: request.headers, body: bytes }).formData()
    const validated = await validateQuotationRequest(form, { siteOrigin: new URL(request.url).origin })
    return new Response(JSON.stringify({ ok: true, designName: validated.designName }), { status: 200, headers })
  } catch (error) {
    const status = error.status || 400
    return new Response(JSON.stringify({ error: status === 413 ? 'The request is too large.' : error.message || 'The quotation request could not be validated.' }), { status, headers })
  }
}
