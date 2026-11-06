import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import nodeVercelHandler, { createAssistantResponseHandler as createVercelAiAssistantHandler, createVercelAiAssistantHandler as createNodeAiAssistantHandler } from '../api/ai-assistant.js'
import aiAssistant from '../netlify/functions/ai-assistant.mjs'
import { clearRateLimitForTests, clearProviderCooldownsForTests } from '../netlify/functions/lib/ai-assistant.mjs'
import { buildKnowledge } from '../netlify/functions/lib/ai-assistant.mjs'

const envNames = [
  'GROQ_API_KEY', 'GROQ_MODEL', 'MISTRAL_API_KEY', 'MISTRAL_MODEL',
  'NVIDIA_NIM_ENABLED', 'NVIDIA_NIM_API_KEY', 'NVIDIA_NIM_MODEL', 'NVIDIA_NIM_BASE_URL',
]
const messages = [{ role: 'user', content: 'Do you have a mandir with a peacock motif?' }]
let clientId = 0
const vercelHandler = createVercelAiAssistantHandler()

async function invokeNodeHandler(handler, webRequest) {
  const requestUrl = new URL(webRequest.url)
  const nodeRequest = {
    method: webRequest.method,
    url: `${requestUrl.pathname}${requestUrl.search}`,
    headers: { ...Object.fromEntries(webRequest.headers.entries()), host: requestUrl.host, 'x-forwarded-proto': requestUrl.protocol.slice(0, -1) },
    body: ['GET', 'HEAD'].includes(webRequest.method) ? undefined : await webRequest.clone().json(),
  }
  const headers = new Map()
  const nodeResponse = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value) },
    end(body) { this.body = body },
  }
  const returned = await handler(nodeRequest, nodeResponse)
  return {
    returned,
    status: nodeResponse.statusCode,
    headers,
    async json() { return JSON.parse(nodeResponse.body) },
    text() { return nodeResponse.body },
  }
}

function request({ method = 'POST', body = JSON.stringify({ messages }), origin = 'https://bharadwaj-mandir-website.vercel.app', contentType = 'application/json' } = {}) {
  return new Request('https://bharadwaj-mandir-website.vercel.app/api/ai-assistant', {
    method,
    headers: {
      origin,
      'content-type': contentType,
      'x-real-ip': `192.0.2.${++clientId % 250 + 1}`,
    },
    body: ['GET', 'HEAD'].includes(method) ? undefined : body,
  })
}

function providerResponse(status, factId = buildKnowledge().find((fact) => fact.kind === 'product')?.id) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ factIds: [factId], unknown: false }) } }],
  }), { status, headers: { 'content-type': 'application/json' } })
}

function shortTimeoutSignal(timeoutMs, delayMs) {
  assert.equal(timeoutMs, 10_000)
  const controller = new AbortController()
  setTimeout(() => controller.abort(new DOMException('Provider request timed out.', 'TimeoutError')), delayMs)
  return controller.signal
}

test('Vercel gives only the assistant function enough time for sequential provider fallback', () => {
  const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'))
  assert.deepEqual(config.functions, { 'api/ai-assistant.js': { maxDuration: 45 } })
})

async function withAssistantEnv(values, callback) {
  const saved = Object.fromEntries(envNames.map((name) => [name, process.env[name]]))
  const originalFetch = globalThis.fetch
  for (const name of envNames) delete process.env[name]
  Object.assign(process.env, values)
  clearRateLimitForTests()
  clearProviderCooldownsForTests()
  try {
    await callback()
  } finally {
    for (const name of envNames) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
    globalThis.fetch = originalFetch
    clearRateLimitForTests()
    clearProviderCooldownsForTests()
  }
}

test('Vercel endpoint returns a grounded Groq answer', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key' }, async () => {
    let calls = 0
    globalThis.fetch = async (url, options) => {
      calls += 1
      assert.match(url, /api\.groq\.com/)
      assert.equal(options.headers.authorization, 'Bearer synthetic-groq-key')
      return providerResponse(200, 'product-peacock-design-mandir')
    }

    const response = await vercelHandler(request())
    const payload = await response.json()
    assert.equal(response.status, 200)
    assert.equal(typeof payload.answer, 'string')
    assert.match(payload.answer, /peacock/i)
    assert.equal(calls, 1)
  })
})

test('Vercel Node handler sends JSON through res and returns no Web Response', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key' }, async () => {
    globalThis.fetch = async () => providerResponse(200, 'product-peacock-design-mandir')
    const result = await invokeNodeHandler(nodeVercelHandler, request())
    assert.equal(result.returned, undefined)
    assert.equal(result.status, 200)
    assert.match(result.headers.get('content-type'), /application\/json/i)
    assert.match((await result.json()).answer, /peacock/i)
  })
})

test('Vercel Node handler sends safe JSON for provider failures', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key' }, async () => {
    globalThis.fetch = async () => providerResponse(503)
    const result = await invokeNodeHandler(nodeVercelHandler, request())
    assert.equal(result.returned, undefined)
    assert.equal(result.status, 502)
    assert.match(result.headers.get('content-type'), /application\/json/i)
    assert.match((await result.json()).error, /try again/i)
  })
})

test('Vercel Node handler returns controlled JSON when its deadline expires', async () => {
  const handler = createNodeAiAssistantHandler({
    totalTimeoutMs: 10,
    assistantHandler: () => new Promise(() => {}),
    logger: { info() {}, warn() {}, error() {} },
  })
  const result = await invokeNodeHandler(handler, request())
  assert.equal(result.returned, undefined)
  assert.equal(result.status, 504)
  assert.match(result.headers.get('content-type'), /application\/json/i)
  assert.match((await result.json()).error, /too long/i)
})

test('Vercel Node handler preserves Netlify deterministic responses', async () => {
  await withAssistantEnv({}, async () => {
    const body = JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] })
    const nodeResponse = await invokeNodeHandler(nodeVercelHandler, request({ body }))
    const netlifyResponse = await aiAssistant(request({ body }), { ip: 'netlify-node-adapter-equivalence' })
    assert.equal(nodeResponse.status, netlifyResponse.status)
    assert.deepEqual(await nodeResponse.json(), await netlifyResponse.json())
  })
})

test('Vercel preserves Netlify deterministic greeting and conversational responses', async () => {
  await withAssistantEnv({}, async () => {
    for (const [index, content] of ['Hello', 'How are you?'].entries()) {
      const body = JSON.stringify({ messages: [{ role: 'user', content }] })
      const netlifyResponse = await aiAssistant(request({ body }), { ip: `netlify-acceptance-${index}` })
      const vercelResponse = await vercelHandler(request({ body }))
      assert.equal(vercelResponse.status, netlifyResponse.status)
      assert.deepEqual(await vercelResponse.json(), await netlifyResponse.json())
    }
  })
})

test('Vercel preserves grounded catalogue and enquiry answers from the Netlify handler', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key' }, async () => {
    const facts = buildKnowledge()
    const productIds = facts.filter(({ kind }) => kind === 'product').map(({ id }) => id)
    const acceptanceCases = [
      ['What types of marble mandirs do you offer?', productIds],
      ['Can I customize my mandir?', ['faq-1']],
      ['What are the available designs?', productIds],
      ['Can you explain the customization process?', ['faq-1', 'faq-2']],
      ['How can I request a quotation?', ['faq-3']],
    ]

    globalThis.fetch = async (_url, options) => {
      const providerRequest = JSON.parse(options.body)
      const question = providerRequest.messages.at(-1).content
      const factIds = acceptanceCases.find(([content]) => content === question)?.[1]
      assert.ok(factIds, `Unexpected assistant question: ${question}`)
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ factIds, unknown: false }) } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    for (const [index, [content]] of acceptanceCases.entries()) {
      const body = JSON.stringify({ messages: [{ role: 'user', content }] })
      const netlifyResponse = await aiAssistant(request({ body }), { ip: `netlify-catalog-${index}` })
      const vercelResponse = await vercelHandler(request({ body }))
      assert.equal(vercelResponse.status, 200, content)
      assert.deepEqual(await vercelResponse.json(), await netlifyResponse.json(), content)
    }
  })
})

test('Vercel forwards the full recent conversation to the original provider logic', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key' }, async () => {
    const conversation = [
      { role: 'user', content: 'Tell me about the peacock design.' },
      { role: 'assistant', content: 'It has a blue peacock motif on the back panel.' },
      { role: 'user', content: 'Can it be customized?' },
    ]
    const expectedFactIds = ['faq-1']
    let netlifyProviderMessages
    let vercelProviderMessages
    globalThis.fetch = async (_url, options) => {
      const messagesInRequest = JSON.parse(options.body).messages
      if (!netlifyProviderMessages) netlifyProviderMessages = messagesInRequest
      else vercelProviderMessages = messagesInRequest
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ factIds: expectedFactIds, unknown: false }) } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const body = JSON.stringify({ messages: conversation })
    const netlifyResponse = await aiAssistant(request({ body }), { ip: 'netlify-history-acceptance' })
    const vercelResponse = await vercelHandler(request({ body }))
    assert.deepEqual(await vercelResponse.json(), await netlifyResponse.json())
    assert.deepEqual(vercelProviderMessages.slice(1), conversation)
    assert.deepEqual(vercelProviderMessages, netlifyProviderMessages)
  })
})

test('Vercel endpoint falls back from Groq to Mistral', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key', MISTRAL_API_KEY: 'synthetic-mistral-key' }, async () => {
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push(url)
      if (url.includes('groq')) return providerResponse(503)
      assert.equal(options.headers.authorization, 'Bearer synthetic-mistral-key')
      return providerResponse(200, 'product-peacock-design-mandir')
    }

    const response = await vercelHandler(request())
    assert.equal(response.status, 200)
    assert.match((await response.json()).answer, /peacock/i)
    assert.equal(calls.length, 2)
    assert.match(calls[0], /groq/)
    assert.match(calls[1], /mistral/)
  })
})

test('Groq failure without Mistral returns a safe provider error', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key' }, async () => {
    globalThis.fetch = async () => providerResponse(503)
    const response = await vercelHandler(request())
    assert.equal(response.status, 502)
    assert.match((await response.json()).error, /try again/i)
  })
})

test('both providers failing returns a consistent JSON error response', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key', MISTRAL_API_KEY: 'synthetic-mistral-key' }, async () => {
    globalThis.fetch = async () => providerResponse(503)
    const response = await vercelHandler(request())
    const payload = await response.json()
    assert.equal(response.status, 502)
    assert.match(response.headers.get('content-type'), /application\/json/i)
    assert.equal(typeof payload.error, 'string')
  })
})

test('no configured providers returns service unavailable', async () => {
  await withAssistantEnv({}, async () => {
    const response = await vercelHandler(request())
    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /temporarily unavailable/i)
  })
})

test('invalid request body is rejected before calling a provider', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key' }, async () => {
    let calls = 0
    globalThis.fetch = async () => { calls += 1; return providerResponse(200) }
    const response = await vercelHandler(request({ body: JSON.stringify({ messages: [] }) }))
    assert.equal(response.status, 400)
    assert.equal(calls, 0)
  })
})

test('unsupported HTTP method returns 405', async () => {
  const response = await vercelHandler(request({ method: 'GET' }))
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('oversized request returns 413', async () => {
  const response = await vercelHandler(request({ body: 'x'.repeat(12_001) }))
  assert.equal(response.status, 413)
})

test('provider timeouts fall back to Mistral', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key', MISTRAL_API_KEY: 'synthetic-mistral-key' }, async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('groq')) {
        const error = new Error('synthetic timeout')
        error.name = 'TimeoutError'
        throw error
      }
      return providerResponse(200, 'product-peacock-design-mandir')
    }
    const response = await vercelHandler(request())
    assert.equal(response.status, 200)
    assert.match((await response.json()).answer, /peacock/i)
  })
})

test('provider timeout aborts the active fetch, logs safe stages, and falls back to Mistral', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key', MISTRAL_API_KEY: 'synthetic-mistral-key' }, async () => {
    const logs = []
    const logger = Object.fromEntries(['info', 'warn', 'error'].map((level) => [level, (line) => logs.push(JSON.parse(line))]))
    let groqSignal
    let groqCalls = 0
    let mistralCalls = 0
    const handler = createVercelAiAssistantHandler({
      logger,
      assistantHandler: (request, context) => aiAssistant(request, {
        ...context,
        timeoutSignal: (timeoutMs) => shortTimeoutSignal(timeoutMs, 15),
      }),
    })
    globalThis.fetch = async (url, { signal }) => {
      if (url.includes('groq')) {
        groqCalls += 1
        groqSignal = signal
        return new Promise((_, reject) => {
          const abort = () => reject(signal.reason)
          signal.addEventListener('abort', abort, { once: true })
          if (signal.aborted) abort()
        })
      }
      mistralCalls += 1
      return providerResponse(200, 'product-peacock-design-mandir')
    }

    const response = await handler(request())
    assert.equal(response.status, 200)
    assert.equal(groqSignal.aborted, true)
    assert.equal(groqCalls, 1)
    assert.equal(mistralCalls, 1)
    assert.match((await response.json()).answer, /peacock/i)
    assert.ok(logs.some(({ event }) => event === 'ai_assistant_request_received'))
    assert.ok(logs.some(({ event }) => event === 'ai_assistant_handler_started'))
    assert.ok(logs.some(({ event, provider }) => event === 'ai_assistant_provider_request_started' && provider === 'groq'))
    assert.ok(logs.some(({ event, provider, outcome }) => event === 'ai_assistant_provider_request_completed' && provider === 'groq' && outcome === 'failure'))
    assert.ok(logs.some(({ event, provider }) => event === 'ai_assistant_fallback_started' && provider === 'mistral'))
    assert.ok(logs.some(({ event, provider, outcome }) => event === 'ai_assistant_provider_request_completed' && provider === 'mistral' && outcome === 'success'))
    assert.ok(logs.some(({ event, provider, outcome }) => event === 'ai_assistant_fallback_completed' && provider === 'mistral' && outcome === 'success'))
    assert.ok(logs.some(({ event, status }) => event === 'ai_assistant_response_returned' && status === 200))
    const requestIds = new Set(logs.map(({ requestId }) => requestId).filter(Boolean))
    assert.equal(requestIds.size, 1)
    const serializedLogs = JSON.stringify(logs)
    assert.doesNotMatch(serializedLogs, /synthetic-(?:groq|mistral)-key|peacock motif/i)
  })
})

test('provider timeout aborts and ends the request with a safe JSON failure without fallback', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key' }, async () => {
    let groqSignal
    const handler = createVercelAiAssistantHandler({
      assistantHandler: (request, context) => aiAssistant(request, {
        ...context,
        timeoutSignal: (timeoutMs) => shortTimeoutSignal(timeoutMs, 10),
      }),
      logger: { info() {}, warn() {}, error() {} },
    })
    globalThis.fetch = async (_url, { signal }) => {
      groqSignal = signal
      return new Promise((_, reject) => {
        const abort = () => reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
    }

    const response = await handler(request())
    const payload = await response.json()
    assert.equal(groqSignal.aborted, true)
    assert.equal(response.status, 502)
    assert.match(response.headers.get('content-type'), /application\/json/i)
    assert.match(payload.error, /could not complete/i)
  })
})

test('stalled Groq response body is bounded and falls back to Mistral', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key', MISTRAL_API_KEY: 'synthetic-mistral-key' }, async () => {
    let groqSignal
    const handler = createVercelAiAssistantHandler({
      logger: { info() {}, warn() {}, error() {} },
      assistantHandler: (request, context) => aiAssistant(request, {
        ...context,
        timeoutSignal: (timeoutMs) => shortTimeoutSignal(timeoutMs, 10),
      }),
    })
    globalThis.fetch = async (url, { signal }) => {
      if (url.includes('groq')) {
        groqSignal = signal
        return { ok: true, status: 200, json: () => new Promise(() => {}) }
      }
      return providerResponse(200, 'product-peacock-design-mandir')
    }

    const response = await handler(request())
    assert.equal(response.status, 200)
    assert.equal(groqSignal.aborted, true)
    assert.match((await response.json()).answer, /peacock/i)
  })
})

test('overall Vercel deadline aborts work and returns a safe JSON response', async () => {
  let deadlineSignal
  const handler = createVercelAiAssistantHandler({
    totalTimeoutMs: 10,
    logger: { info() {}, warn() {}, error() {} },
    assistantHandler: (_request, context) => {
      deadlineSignal = context.deadlineSignal
      return new Promise(() => {})
    },
  })
  const response = await handler(request())
  const payload = await response.json()
  assert.equal(response.status, 504)
  assert.equal(deadlineSignal.aborted, true)
  assert.match(response.headers.get('content-type'), /application\/json/i)
  assert.match(payload.error, /too long/i)
  assert.doesNotMatch(JSON.stringify(payload), /stack|secret|internal/i)
})

test('unexpected handler errors return a generic response and log no details', async () => {
  const logs = []
  const handler = createVercelAiAssistantHandler({
    assistantHandler: async () => { throw new Error('private stack or provider secret') },
    logger: { error: (message) => logs.push(message) },
  })
  const response = await handler(request())
  const body = await response.text()
  assert.equal(response.status, 500)
  assert.doesNotMatch(body, /private stack|secret|Error/)
  assert.equal(logs.length, 1)
  const failureLog = JSON.parse(logs[0])
  assert.equal(failureLog.event, 'ai_assistant_request_failed')
  assert.match(failureLog.requestId, /^[0-9a-f-]{36}$/i)
})

test('empty or malformed assistant handler responses become safe JSON errors', async () => {
  for (const invalidResponse of [undefined, new Response('', { status: 200 }), new Response('<html>upstream failure</html>', { status: 200 })]) {
    const handler = createVercelAiAssistantHandler({ assistantHandler: async () => invalidResponse })
    const response = await handler(request())
    const payload = await response.json()
    assert.equal(response.status, 502)
    assert.match(response.headers.get('content-type'), /application\/json/i)
    assert.equal(typeof payload.error, 'string')
    assert.doesNotMatch(JSON.stringify(payload), /upstream failure|stack|secret/i)
  }
})

test('same-origin validation remains enforced on Vercel', async () => {
  await withAssistantEnv({ GROQ_API_KEY: 'synthetic-groq-key' }, async () => {
    let calls = 0
    globalThis.fetch = async () => { calls += 1; return providerResponse(200) }
    const response = await vercelHandler(request({ origin: 'https://attacker.example' }))
    assert.equal(response.status, 403)
    assert.equal(calls, 0)
  })
})
