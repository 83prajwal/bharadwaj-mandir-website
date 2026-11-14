import { createHmac, randomBytes } from 'node:crypto'

const MAX_RESPONSE_BYTES = 16_000
const REQUEST_TIMEOUT_MS = 12_000

function validateConfiguration(urlValue, secretValue) {
  if (typeof urlValue !== 'string' || typeof secretValue !== 'string' || !secretValue.trim()) {
    throw new Error('Studio Lead Apps Script configuration is missing.')
  }
  let url
  try { url = new URL(urlValue.trim()) } catch { throw new Error('Studio Lead Apps Script configuration is invalid.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.hostname !== 'script.google.com' || !/^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname)) {
    throw new Error('Studio Lead Apps Script configuration is invalid.')
  }
  const secret = secretValue.trim()
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Studio Lead Apps Script configuration is invalid.')
  return { url: url.href.replace(/\/$/, ''), secret }
}

function signatureFor(secret, timestamp, nonce, payload) {
  const canonical = `${timestamp}.${nonce}.${JSON.stringify(payload)}`
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('base64url')
}

export function createStudioLeadAppsScriptAppender({
  url = process.env.STUDIO_LEAD_APPS_SCRIPT_URL,
  secret = process.env.STUDIO_LEAD_APPS_SCRIPT_SECRET,
  fetchImpl = fetch,
  now = () => Date.now(),
  nonce = () => randomBytes(24).toString('hex'),
} = {}) {
  const config = validateConfiguration(url, secret)

  return async function appendStudioLeadRowToAppsScript(row, { idempotencyKey } = {}) {
    if (!Array.isArray(row) || row.length !== 9 || row.some((value) => typeof value !== 'string')) {
      throw new Error('Studio Lead row is invalid.')
    }
    if (typeof idempotencyKey !== 'string' || !/^(signup|quotation)\/[a-f0-9]{64}$/.test(idempotencyKey)) {
      throw new Error('Studio Lead idempotency key is invalid.')
    }

    const timestamp = new Date(now()).toISOString()
    const requestNonce = nonce()
    if (!/^[a-f0-9]{48}$/.test(requestNonce)) throw new Error('Studio Lead request nonce is invalid.')
    const payload = { operation: 'studioLeadAppend', idempotencyKey, row }
    const envelope = {
      timestamp,
      nonce: requestNonce,
      signature: signatureFor(config.secret, timestamp, requestNonce, payload),
      payload,
    }

    let response
    try {
      response = await fetchImpl(config.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'follow',
      })
    } catch {
      throw new Error('Studio Lead Apps Script request failed.')
    }

    let body
    try {
      const text = await response.text()
      if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('response too large')
      body = JSON.parse(text)
    } catch {
      throw new Error('Studio Lead Apps Script returned an unreadable response.')
    }
    if (!response.ok || body?.ok !== true || body?.result?.accepted !== true) {
      throw new Error('Studio Lead Apps Script could not save the lead.')
    }
    return body.result
  }
}
