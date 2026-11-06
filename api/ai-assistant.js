import { randomUUID } from 'node:crypto'
import aiAssistant from '../netlify/functions/ai-assistant.mjs'

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

export function createVercelAiAssistantHandler({ assistantHandler = aiAssistant, logger = console } = {}) {
  return async function handleVercelAiAssistant(request) {
    const requestId = randomUUID()
    const startedAt = Date.now()
    let responseStatus = 500
    writeLog(logger, 'info', { event: 'ai_assistant_request_received', requestId })
    try {
      writeLog(logger, 'info', { event: 'ai_assistant_handler_started', requestId })
      const response = await assistantHandler(request, { ip: clientAddress(request), requestId, logger })
      const normalized = await normalizeAssistantResponse(response)
      responseStatus = normalized.status
      return normalized
    } catch {
      writeLog(logger, 'error', { event: 'ai_assistant_request_failed', requestId })
      const response = jsonResponse(500, { error: 'The assistant is temporarily unavailable. Please use the enquiry form.' })
      responseStatus = response.status
      return response
    } finally {
      writeLog(logger, 'info', {
        event: 'ai_assistant_response_returned',
        requestId,
        status: responseStatus,
        durationMs: Date.now() - startedAt,
      })
    }
  }
}

// Vercel's Node.js runtime uses the standard Web Request/Response handler API.
export default createVercelAiAssistantHandler()
