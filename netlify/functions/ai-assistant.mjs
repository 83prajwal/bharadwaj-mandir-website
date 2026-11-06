import { randomUUID } from 'node:crypto'
import {
  ASSISTANT_TOTAL_TIMEOUT_MS,
  buildKnowledge,
  checkRateLimit,
  classifyDeterministicIntent,
  configuredProviders,
  composeGroundedAnswer,
  selectKnowledgeFacts,
  validateChatRequest,
} from './lib/ai-assistant.mjs'

const responseHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const MAX_REQUEST_BODY_BYTES = 12_000
const REQUEST_BODY_TIMEOUT_MS = 5_000

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: responseHeaders })
}

function logStage(logger, requestId, stage, startedAt, outcome = 'completed') {
  try {
    logger.info(JSON.stringify({ event: 'ai_assistant_stage_completed', requestId, stage, outcome, durationMs: Date.now() - startedAt }))
  } catch { /* logging must not affect request handling */ }
}

export async function readRequestBody(request, { maxBytes = MAX_REQUEST_BODY_BYTES, timeoutMs = REQUEST_BODY_TIMEOUT_MS } = {}) {
  if (!request.body) return ''

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let rawBody = ''
  let timeoutId
  let timedOut = false
  const cancelReader = () => {
    try { void reader.cancel().catch(() => {}) } catch { /* cancellation is best effort */ }
  }

  const read = async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return rawBody + decoder.decode()
      bytesRead += value.byteLength
      if (bytesRead > maxBytes) {
        cancelReader()
        const error = new Error('Request body exceeds the allowed size.')
        error.code = 'BODY_TOO_LARGE'
        throw error
      }
      rawBody += decoder.decode(value, { stream: true })
    }
  }

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true
      cancelReader()
      const error = new Error('Request body read timed out.')
      error.code = 'BODY_READ_TIMEOUT'
      reject(error)
    }, timeoutMs)
  })

  try {
    return await Promise.race([read(), timeout])
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error('Request body read timed out.')
      timeoutError.code = 'BODY_READ_TIMEOUT'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    try { reader.releaseLock() } catch { /* an in-flight read may still be settling */ }
  }
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
  const logger = context.logger || console
  const requestId = context.requestId || randomUUID()
  const bodyStartedAt = Date.now()
  if (request.method !== 'POST') return json(405, { error: 'Use POST for assistant messages.' })
  if (!isSameOrigin(request)) return json(403, { error: 'This request could not be accepted.' })
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return json(415, { error: 'Send a JSON request.' })
  }

  let rawBody
  try {
    rawBody = await readRequestBody(request, { timeoutMs: context.requestBodyTimeoutMs ?? REQUEST_BODY_TIMEOUT_MS })
  } catch (error) {
    logStage(logger, requestId, 'request_body', bodyStartedAt, error?.code || 'read_error')
    if (error?.code === 'BODY_TOO_LARGE') return json(413, { error: 'The message is too large.' })
    if (error?.code === 'BODY_READ_TIMEOUT') return json(408, { error: 'The message took too long to arrive. Please try again.' })
    return json(400, { error: 'The message could not be read.' })
  }
  logStage(logger, requestId, 'request_body', bodyStartedAt)
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BODY_BYTES) return json(413, { error: 'The message is too large.' })
  if (!rawBody.trim()) return json(400, { error: 'The message could not be read.' })

  const validationStartedAt = Date.now()
  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return json(400, { error: 'The message could not be read.' })
  }
  const messages = validateChatRequest(body)
  if (!messages) return json(400, { error: 'Please send a message of up to 1,200 characters.' })
  logStage(logger, requestId, 'request_validation', validationStartedAt)

  const rateLimitStartedAt = Date.now()
  const ip = context.ip || request.headers.get('x-nf-client-connection-ip') || 'unknown'
  if (!checkRateLimit(ip)) return json(429, { error: 'Please wait a little before sending another message.' })
  logStage(logger, requestId, 'rate_limit', rateLimitStartedAt)

  const intentStartedAt = Date.now()
  const deterministicResponse = classifyDeterministicIntent(messages)
  logStage(logger, requestId, 'deterministic_intent', intentStartedAt, deterministicResponse ? 'matched' : 'no_match')
  if (deterministicResponse) return json(200, deterministicResponse)

  const providers = configuredProviders()
  if (process.env.NVIDIA_NIM_ENABLED === 'true' && (!process.env.NVIDIA_NIM_API_KEY || !process.env.NVIDIA_NIM_MODEL)) {
    logger.warn(JSON.stringify({ event: 'ai_assistant_provider_config_incomplete', provider: 'nvidia_nim' }))
  }
  if (!providers.length) {
    logger.warn(JSON.stringify({ event: 'ai_assistant_unavailable', reason: 'no_providers_configured' }))
    return json(503, { error: 'The assistant is temporarily unavailable. Please use the enquiry form.' })
  }

  try {
    const knowledgeStartedAt = Date.now()
    const facts = buildKnowledge()
    logStage(logger, requestId, 'knowledge_build', knowledgeStartedAt)
    const { selection } = await selectKnowledgeFacts({
      messages,
      facts,
      providers,
      logger,
      requestId,
      deadlineSignal: context.deadlineSignal || AbortSignal.timeout(ASSISTANT_TOTAL_TIMEOUT_MS),
      ...(context.timeoutSignal ? { timeoutSignal: context.timeoutSignal } : {}),
    })
    const compositionStartedAt = Date.now()
    const result = composeGroundedAnswer(selection, facts, messages)
    if (!result) throw new Error('AI provider returned an invalid fact selection.')
    logStage(logger, requestId, 'response_composition', compositionStartedAt)
    return json(200, result)
  } catch {
    logger.error(JSON.stringify({ event: 'ai_assistant_request_failed', requestId }))
    return json(502, { error: 'I could not complete that response. Please try again or use the enquiry form.' })
  }
}
