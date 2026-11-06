import aiAssistant from '../netlify/functions/ai-assistant.mjs'

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function clientAddress(request) {
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export function createVercelAiAssistantHandler({ assistantHandler = aiAssistant, logger = console } = {}) {
  return async function handleVercelAiAssistant(request) {
    try {
      return await assistantHandler(request, { ip: clientAddress(request) })
    } catch {
      logger.error(JSON.stringify({ event: 'ai_assistant_request_failed' }))
      return new Response(JSON.stringify({ error: 'The assistant is temporarily unavailable. Please use the enquiry form.' }), {
        status: 500,
        headers: jsonHeaders,
      })
    }
  }
}

// Vercel's Node.js runtime uses the standard Web Request/Response handler API.
export default createVercelAiAssistantHandler()
