import {
  buildKnowledge,
  checkRateLimit,
  classifyDeterministicIntent,
  configuredProviders,
  composeGroundedAnswer,
  selectKnowledgeFacts,
  validateChatRequest,
} from './lib/ai-assistant.mjs'

const responseHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders })
}

function isSameOrigin(request) {
  try {
    const origin = request.headers.get('origin')
    return Boolean(origin) && new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export default async function aiAssistant(request, context = {}) {
  if (request.method !== 'POST') return json(405, { error: 'Use POST for assistant messages.' })
  if (!isSameOrigin(request)) return json(403, { error: 'This request could not be accepted.' })
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return json(415, { error: 'Send a JSON request.' })
  }

  let rawBody
  try {
    rawBody = await request.text()
  } catch {
    return json(400, { error: 'The message could not be read.' })
  }
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > 12_000) return json(413, { error: 'The message is too large.' })

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return json(400, { error: 'The message could not be read.' })
  }
  const messages = validateChatRequest(body)
  if (!messages) return json(400, { error: 'Please send a message of up to 1,200 characters.' })

  const ip = context.ip || request.headers.get('x-nf-client-connection-ip') || 'unknown'
  if (!checkRateLimit(ip)) return json(429, { error: 'Please wait a little before sending another message.' })

  const deterministicResponse = classifyDeterministicIntent(messages)
  if (deterministicResponse) return json(200, deterministicResponse)

  const providers = configuredProviders()
  if (process.env.NVIDIA_NIM_ENABLED === 'true' && (!process.env.NVIDIA_NIM_API_KEY || !process.env.NVIDIA_NIM_MODEL)) {
    console.warn(JSON.stringify({ event: 'ai_assistant_provider_config_incomplete', provider: 'nvidia_nim' }))
  }
  if (!providers.length) {
    console.warn(JSON.stringify({ event: 'ai_assistant_unavailable', reason: 'no_providers_configured' }))
    return json(503, { error: 'The assistant is temporarily unavailable. Please use the enquiry form.' })
  }

  try {
    const facts = buildKnowledge()
    const { selection } = await selectKnowledgeFacts({ messages, facts, providers })
    const result = composeGroundedAnswer(selection, facts, messages)
    if (!result) throw new Error('AI provider returned an invalid fact selection.')
    return json(200, result)
  } catch {
    console.error(JSON.stringify({ event: 'ai_assistant_request_failed' }))
    return json(502, { error: 'I could not complete that response. Please try again or use the enquiry form.' })
  }
}
