import test from 'node:test'
import assert from 'node:assert/strict'
import vercelHandler, { createVercelAiAssistantHandler } from '../api/ai-assistant.js'
import { clearRateLimitForTests, clearProviderCooldownsForTests } from '../netlify/functions/lib/ai-assistant.mjs'
import { buildKnowledge } from '../netlify/functions/lib/ai-assistant.mjs'

const envNames = [
  'GROQ_API_KEY', 'GROQ_MODEL', 'MISTRAL_API_KEY', 'MISTRAL_MODEL',
  'NVIDIA_NIM_ENABLED', 'NVIDIA_NIM_API_KEY', 'NVIDIA_NIM_MODEL', 'NVIDIA_NIM_BASE_URL',
]
const messages = [{ role: 'user', content: 'Do you have a mandir with a peacock motif?' }]
let clientId = 0

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
  assert.deepEqual(logs, ['{"event":"ai_assistant_request_failed"}'])
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
