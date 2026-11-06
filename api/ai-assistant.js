import aiAssistant from '../netlify/functions/ai-assistant.mjs'

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders })
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
    try {
      const response = await assistantHandler(request, { ip: clientAddress(request) })
      return await normalizeAssistantResponse(response)
    } catch {
      logger.error(JSON.stringify({ event: 'ai_assistant_request_failed' }))
      return jsonResponse(500, { error: 'The assistant is temporarily unavailable. Please use the enquiry form.' })
    }
  }
}

// Vercel's Node.js runtime uses the standard Web Request/Response handler API.
export default createVercelAiAssistantHandler()
