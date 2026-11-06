import { randomUUID } from 'node:crypto'
import aiAssistant from '../netlify/functions/ai-assistant.mjs'
import { ASSISTANT_TOTAL_TIMEOUT_MS } from '../netlify/functions/lib/ai-assistant.mjs'

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders })
}

function writeLog(logger, level, fields) {
  try {
    logger[level]?.(JSON.stringify(fields))
  } catch {
    // Logging must never change the assistant response.
  }
}

async function normalizeAssistantResponse(response) {
  if (!(response instanceof Response)) {
    return jsonResponse(502, { error: 'The assistant returned an invalid response. Please try again or use the enquiry form.' })
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse(502, { error: 'The assistant could not complete that response. Please try again or use the enquiry form.' })
  }

  if (response.ok) {
    if (typeof payload.answer !== 'string' || !payload.answer.trim()) {
      return jsonResponse(502, { error: 'The assistant could not complete that response. Please try again or use the enquiry form.' })
    }
    return jsonResponse(response.status, { answer: payload.answer, handoff: payload.handoff === true })
  }

  return jsonResponse(response.status, {
    error: typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : 'The assistant is temporarily unavailable. Please use the enquiry form.',
  })
}

function clientAddress(request) {
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export function createAssistantResponseHandler({ assistantHandler = aiAssistant, logger = console, totalTimeoutMs = ASSISTANT_TOTAL_TIMEOUT_MS } = {}) {
  return async function handleVercelAiAssistant(request) {
    const requestId = randomUUID()
    const startedAt = Date.now()
    const deadlineController = new AbortController()
    let responseStatus = 500
    let timedOut = false
    let timeoutId
    writeLog(logger, 'info', { event: 'ai_assistant_request_received', requestId })
    try {
      writeLog(logger, 'info', { event: 'ai_assistant_handler_started', requestId })
      const work = (async () => {
        const response = await assistantHandler(request, {
          ip: clientAddress(request), requestId, logger, deadlineSignal: deadlineController.signal,
        })
        return normalizeAssistantResponse(response)
      })()
      const deadline = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true
          const error = new DOMException('Assistant execution deadline reached.', 'TimeoutError')
          deadlineController.abort(error)
          writeLog(logger, 'error', { event: 'ai_assistant_overall_deadline_reached', requestId, durationMs: Date.now() - startedAt })
          reject(error)
        }, totalTimeoutMs)
      })
      const normalized = await Promise.race([work, deadline])
      responseStatus = normalized.status
      return normalized
    } catch {
      writeLog(logger, 'error', { event: timedOut ? 'ai_assistant_overall_deadline_response' : 'ai_assistant_request_failed', requestId })
      const response = jsonResponse(timedOut ? 504 : 500, {
        error: timedOut
          ? 'The assistant is taking too long to respond. Please try again or use the enquiry form.'
          : 'The assistant is temporarily unavailable. Please use the enquiry form.',
      })
      responseStatus = response.status
      return response
    } finally {
      clearTimeout(timeoutId)
      writeLog(logger, 'info', {
        event: 'ai_assistant_response_returned',
        requestId,
        status: responseStatus,
        durationMs: Date.now() - startedAt,
      })
    }
  }
}

function nodeRequestToWebRequest(request) {
  const rawHeaders = request.headers || {}
  const headerValue = (name) => {
    const value = rawHeaders[name] ?? rawHeaders[name.toLowerCase()]
    return Array.isArray(value) ? value[0] : value
  }
  const headers = new Headers()
  for (const [name, value] of Object.entries(rawHeaders)) {
    if (value === undefined || ['connection', 'content-length', 'host', 'transfer-encoding'].includes(name.toLowerCase())) continue
    headers.set(name, Array.isArray(value) ? value.join(', ') : String(value))
  }

  const method = String(request.method || 'GET').toUpperCase()
  const forwardedProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const protocol = forwardedProto || 'https'
  const host = String(headerValue('x-forwarded-host') || headerValue('host') || 'localhost').split(',')[0].trim()
  const url = new URL(request.url || '/', `${protocol}://${host || 'localhost'}`)

  let body
  if (!['GET', 'HEAD'].includes(method) && request.body !== undefined && request.body !== null) {
    const contentType = headers.get('content-type') || ''
    body = typeof request.body === 'string' && contentType.toLowerCase().startsWith('application/json')
      ? request.body
      : JSON.stringify(request.body)
  }

  return new Request(url, { method, headers, ...(body !== undefined ? { body } : {}) })
}

function sendResponse(nodeResponse, webResponse, payload) {
  nodeResponse.statusCode = webResponse.status
  for (const [name, value] of webResponse.headers.entries()) nodeResponse.setHeader(name, value)
  nodeResponse.setHeader('content-type', 'application/json; charset=utf-8')
  nodeResponse.end(JSON.stringify(payload))
}

export function createVercelAiAssistantHandler(options = {}) {
  const handleAssistant = createAssistantResponseHandler(options)
  return async function vercelNodeHandler(request, response) {
    try {
      let webRequest
      try {
        webRequest = nodeRequestToWebRequest(request)
      } catch {
        sendResponse(response, jsonResponse(400, { error: 'The message could not be read.' }), { error: 'The message could not be read.' })
        return
      }

      const webResponse = await handleAssistant(webRequest)
      let payload
      try {
        payload = await webResponse.json()
      } catch {
        payload = { error: 'The assistant could not complete that response. Please try again or use the enquiry form.' }
        sendResponse(response, jsonResponse(502, payload), payload)
        return
      }
      sendResponse(response, webResponse, payload)
    } catch {
      const payload = { error: 'The assistant is temporarily unavailable. Please use the enquiry form.' }
      sendResponse(response, jsonResponse(500, payload), payload)
    }
  }
}

// Vite projects using Vercel's Node API runtime require (req, res) and an explicit res.end().
export default createVercelAiAssistantHandler()
