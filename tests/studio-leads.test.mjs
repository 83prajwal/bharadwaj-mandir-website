import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  createVercelStudioLeadHandler,
  createVercelStudioLeadNodeHandler,
} from '../api/studio-lead.js'

import {
  appendStudioLeadRow,
  buildStudioLeadRow,
  createStudioLeadHandler,
  formatDesignDetails,
  normalizeIndianPhone,
  STUDIO_LEAD_HEADERS,
} from '../netlify/functions/lib/studio-leads.mjs'

function memoryStore() {
  const values = new Map()
  return {
    values,
    async get(key) { return values.has(key) ? JSON.parse(values.get(key)) : null },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && values.has(key)) return { modified: false }
      values.set(key, JSON.stringify(value))
      return { modified: true }
    },
    async delete(key) { values.delete(key) },
  }
}

function setup({ user = null, appendRow, createAccount } = {}) {
  const rows = []
  const accounts = []
  const handler = createStudioLeadHandler({
    store: memoryStore(),
    createAccount: createAccount || (async (email, password, data) => { accounts.push({ email, password, data }); return { id: 'u1', email } }),
    currentUser: async () => user,
    appendRow: appendRow || (async (row) => { rows.push(row) }),
    now: () => new Date('2026-11-06T10:00:00Z'),
    timeZone: () => 'Asia/Kolkata',
  })
  return { handler, rows, accounts }
}

const request = (body, headers = {}) => new Request('https://site.test/.netlify/functions/studio-lead', {
  method: 'POST',
  headers: { origin: 'https://site.test', 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})
const signup = (overrides = {}) => ({ action: 'signup', fullName: 'Asha Rao', phone: '98765 43210', email: 'Asha@Example.com', password: 'long-enough', website: '', consent: true, ...overrides })
const quote = (overrides = {}) => ({ action: 'quotation', designName: 'Pooja room', design: { width: 1200, height: 2100, style: 'Heritage', material: 'White', pillars: 2 }, ...overrides })
const member = { id: 'u1', email: 'asha@example.com', userMetadata: { full_name: 'Asha Rao', phone: '+919876543210', contact_consent: true } }

async function invokeVercelNode(handler, webRequest) {
  const url = new URL(webRequest.url)
  const input = webRequest.method === 'GET' || webRequest.method === 'HEAD'
    ? Readable.from([])
    : Readable.from([Buffer.from(await webRequest.clone().arrayBuffer())])
  input.method = webRequest.method
  input.url = `${url.pathname}${url.search}`
  input.headers = {
    ...Object.fromEntries(webRequest.headers.entries()),
    host: url.host,
    'x-forwarded-proto': url.protocol.slice(0, -1),
    'x-real-ip': '203.0.113.21',
  }
  const headers = new Headers()
  const output = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name, value) },
    end(body) { this.body = body },
  }
  const returned = await handler(input, output)
  return { returned, response: new Response(output.body, { status: output.statusCode, headers }) }
}

function vercelRequest(body, headers = {}) {
  return new Request('https://site.test/api/studio-lead', {
    method: 'POST',
    headers: { origin: 'https://site.test', 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function vercelSetup({ currentUser = async () => null, createAccount = async () => ({ confirmedAt: null }), appendRow = async () => {} } = {}) {
  const store = memoryStore()
  const leadHandler = createVercelStudioLeadHandler({ store, currentUser, createAccount, appendRow })
  const nodeHandler = createVercelStudioLeadNodeHandler({ getHandler: () => leadHandler, logger: { error() {} } })
  return { store, leadHandler, nodeHandler }
}

test('Indian phone numbers accept an optional country code and are normalised', () => {
  for (const value of ['9876543210', '98765 43210', '+91 98765-43210', '919876543210', '09876543210']) {
    assert.equal(normalizeIndianPhone(value), '+919876543210', value)
  }
  for (const value of ['12345', '5876543210', '+1 415 555 2671', '98765432101', '']) {
    assert.equal(normalizeIndianPhone(value), null, value)
  }
})

test('the sheet row has the agreed columns in order', () => {
  assert.deepEqual(STUDIO_LEAD_HEADERS, ['Date', 'Name', 'Phone', 'Email', 'Design interest', 'Design details', 'Consent', 'Status', 'Notes'])
  const row = buildStudioLeadRow({ date: 'd', name: 'n', phone: 'p', email: 'e', interest: 'i', details: 'x', consent: true })
  assert.equal(row.length, STUDIO_LEAD_HEADERS.length)
  assert.deepEqual(row.slice(6), ['Yes', 'New', ''])
})

test('design details list width, height, style, marble and pillars', () => {
  assert.equal(formatDesignDetails({ width: 1200, height: 2100, style: 'Heritage', material: 'White', pillars: 2 }), 'Width: 1200 mm; Height: 2100 mm; Style: Heritage; Marble: White; Pillars: 2')
  assert.match(formatDesignDetails({ width: 'x', pillars: 99 }), /Width: Not set.*Pillars: Not set/)
})

test('a valid sign-up creates one account and exactly one row', async () => {
  const { handler, rows, accounts } = setup()
  const response = await handler(request(signup()))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, saved: true, confirmationRequired: true })
  assert.equal(accounts.length, 1)
  assert.equal(accounts[0].email, 'asha@example.com')
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].slice(1, 5), ['Asha Rao', '+919876543210', 'asha@example.com', '3D Studio sign-up'])
  assert.equal(rows[0][6], 'Yes')
  assert.equal(rows[0][7], 'New')
  assert.doesNotMatch(JSON.stringify(rows[0]), /long-enough/)
})

test('Vercel Node endpoint accepts a valid sign-up and sends a JSON response', async () => {
  const rows = []
  const accounts = []
  const { nodeHandler } = vercelSetup({
    createAccount: async (...args) => { accounts.push(args); return { confirmedAt: null } },
    appendRow: async (row) => rows.push(row),
  })
  const { returned, response } = await invokeVercelNode(nodeHandler, vercelRequest(signup()))
  assert.equal(returned, undefined)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /application\/json/i)
  assert.deepEqual(await response.json(), { ok: true, saved: true, confirmationRequired: true })
  assert.equal(accounts.length, 1)
  assert.equal(accounts[0][0], 'asha@example.com')
  assert.equal(rows.length, 1)
})

test('Vercel registration adapter preserves Netlify request, validation and error responses', async () => {
  const cases = [
    [request(signup(), { origin: 'https://evil.test' }), 403],
    [new Request('https://site.test/.netlify/functions/studio-lead', { method: 'GET' }), 405],
    [request(signup(), { 'content-type': 'text/plain' }), 415],
    [request('{not json'), 400],
    [request(signup({ fullName: 'x'.repeat(20_000) })), 413],
    [request(signup({ phone: '123' })), 400],
    [request({ action: 'unknown' }), 400],
  ]
  for (const [netlifyRequest, expectedStatus] of cases) {
    const netlifyHandler = setup().handler
    const { nodeHandler } = vercelSetup()
    const vercelUrl = new URL(netlifyRequest.url)
    const vercelReq = new Request(`https://site.test/api/studio-lead${vercelUrl.search}`, {
      method: netlifyRequest.method,
      headers: new Headers(netlifyRequest.headers),
      ...(netlifyRequest.method === 'GET' ? {} : { body: await netlifyRequest.clone().text() }),
    })
    const netlifyResponse = await netlifyHandler(netlifyRequest)
    const { response: vercelResponse } = await invokeVercelNode(nodeHandler, vercelReq)
    assert.equal(netlifyResponse.status, expectedStatus)
    assert.equal(vercelResponse.status, netlifyResponse.status)
    assert.deepEqual(await vercelResponse.json(), await netlifyResponse.json())
  }
})

test('Vercel quotation action keeps authorization and reads the existing Netlify Identity user', async () => {
  const rows = []
  let requestedUrl
  const { nodeHandler } = vercelSetup({
    appendRow: async (row) => rows.push(row),
  })
  const leadHandler = createVercelStudioLeadHandler({
    store: memoryStore(),
    appendRow: async (row) => rows.push(row),
    identityUrl: 'https://identity.test/.netlify/identity',
    fetchImpl: async (url, options) => {
      requestedUrl = String(url)
      assert.equal(options.headers.authorization, 'Bearer identity-session-token')
      return Response.json({ id: 'u1', email: 'asha@example.com', name: 'Asha Rao', user_metadata: { full_name: 'Asha Rao', phone: '+919876543210', contact_consent: true } })
    },
  })
  const authenticatedNodeHandler = createVercelStudioLeadNodeHandler({ getHandler: () => leadHandler, logger: { error() {} } })
  const quoteRequest = vercelRequest(quote(), { cookie: 'nf_jwt=identity-session-token' })
  const { response } = await invokeVercelNode(authenticatedNodeHandler, quoteRequest)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, saved: true })
  assert.match(requestedUrl, /identity\.test\/.netlify\/identity\/user$/)
  assert.equal(rows.length, 1)
  assert.equal(rows[0][3], 'asha@example.com')

  const { response: unauthorized } = await invokeVercelNode(nodeHandler, vercelRequest(quote()))
  assert.equal(unauthorized.status, 401)
  assert.match((await unauthorized.json()).error, /log in/i)
})

test('Vercel Identity signup adapter forwards the existing Identity payload and duplicate status', async () => {
  const store = memoryStore()
  let identityRequest
  const leadHandler = createVercelStudioLeadHandler({
    store,
    appendRow: async () => {},
    identityUrl: 'https://identity.test/.netlify/identity',
    fetchImpl: async (url, options) => {
      identityRequest = { url: String(url), options }
      return Response.json({ msg: 'A user with this email address has already been registered' }, { status: 422 })
    },
  })
  const nodeHandler = createVercelStudioLeadNodeHandler({ getHandler: () => leadHandler, logger: { error() {} } })
  const { response } = await invokeVercelNode(nodeHandler, vercelRequest(signup()))
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /already exists.*log in/i)
  assert.equal(identityRequest.url, 'https://identity.test/.netlify/identity/signup')
  assert.deepEqual(JSON.parse(identityRequest.options.body), {
    email: 'asha@example.com',
    password: 'long-enough',
    data: { full_name: 'Asha Rao', phone: '+919876543210', contact_consent: true },
  })
})

test('Studio registration frontend uses the Vercel endpoint and Identity remains routed to Netlify', () => {
  const caller = readFileSync(join(process.cwd(), 'src', 'lib', 'studioLead.js'), 'utf8')
  assert.match(caller, /STUDIO_LEAD_API\s*=\s*'\/api\/studio-lead'/)
  const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'))
  const identityRewriteIndex = config.rewrites.findIndex(({ source }) => source === '/.netlify/identity')
  const spaRewriteIndex = config.rewrites.findIndex(({ source }) => source === '/(.*)')
  assert.ok(identityRewriteIndex >= 0)
  assert.ok(config.rewrites.some(({ source, destination }) => source === '/.netlify/identity/:path*' && destination.includes('.netlify.app/.netlify/identity/:path*')))
  assert.ok(identityRewriteIndex < spaRewriteIndex)
})

test('repeating a sign-up never adds a second row', async () => {
  const { handler, rows } = setup()
  await handler(request(signup()))
  await handler(request(signup({ email: 'asha@example.com' })))
  const results = await Promise.all([handler(request(signup())), handler(request(signup()))])
  assert.ok(results.every((response) => response.status === 200))
  assert.equal(rows.length, 1)
})

test('an account that already exists is told to log in and adds no row', async () => {
  const { handler, rows } = setup({ createAccount: async () => { throw Object.assign(new Error('A user with this email address has already been registered'), { status: 422 }) } })
  const response = await handler(request(signup()))
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /log in/i)
  assert.equal(rows.length, 0)
})

test('the honeypot silently drops bots', async () => {
  const { handler, rows, accounts } = setup()
  const response = await handler(request(signup({ website: 'https://spam.example' })))
  assert.equal(response.status, 200)
  assert.equal(rows.length, 0)
  assert.equal(accounts.length, 0)
})

test('invalid sign-ups are rejected on the server before an account exists', async () => {
  for (const bad of [{ fullName: 'A' }, { phone: '123' }, { email: 'nope' }, { password: 'short' }, { consent: false }, { consent: 'true' }]) {
    const { handler, rows, accounts } = setup()
    const response = await handler(request(signup(bad)))
    assert.equal(response.status, 400, JSON.stringify(bad))
    assert.equal(rows.length + accounts.length, 0)
  }
})

test('sign-ups are rate limited per client', async () => {
  const { handler, accounts } = setup()
  const statuses = []
  for (let i = 0; i < 7; i += 1) {
    const response = await handler(request(signup({ email: `user${i}@example.com` })), { ip: '203.0.113.9' })
    statuses.push(response.status)
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429])
  assert.equal(accounts.length, 5)
  assert.equal((await handler(request(signup({ email: 'other@example.com' })), { ip: '203.0.113.10' })).status, 200)
})

test('a failed sheet save is reported and can be retried', async () => {
  let fail = true
  const rows = []
  const { handler } = setup({ appendRow: async (row) => { if (fail) throw new Error('Sheets down'); rows.push(row) } })
  const failed = await handler(request(signup()))
  assert.equal(failed.status, 200)
  assert.equal((await failed.json()).saved, false)
  fail = false
  assert.equal((await (await handler(request(signup()))).json()).saved, true)
  assert.equal(rows.length, 1)
})

test('quotations need a logged-in user', async () => {
  const { handler, rows } = setup()
  assert.equal((await handler(request(quote()))).status, 401)
  assert.equal(rows.length, 0)
})

test('a quotation writes the account details and design to the sheet once per design', async () => {
  const { handler, rows } = setup({ user: member })
  assert.equal((await handler(request(quote({ email: 'forged@example.com' })))).status, 200)
  await handler(request(quote()))
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].slice(1, 7), ['Asha Rao', '+919876543210', 'asha@example.com', 'Quotation: Pooja room', 'Width: 1200 mm; Height: 2100 mm; Style: Heritage; Marble: White; Pillars: 2', 'Yes'])
  await handler(request(quote({ design: { width: 1500, height: 2100, style: 'Heritage', material: 'White', pillars: 2 } })))
  assert.equal(rows.length, 2)
})

test('a failed quotation save returns an error so the page can offer WhatsApp', async () => {
  const { handler } = setup({ user: member, appendRow: async () => { throw new Error('Sheets down') } })
  assert.equal((await handler(request(quote()))).status, 503)
})

test('cross-site, oversized and malformed requests are refused', async () => {
  const { handler, accounts } = setup()
  assert.equal((await handler(request(signup(), { origin: 'https://evil.test' }))).status, 403)
  assert.equal((await handler(new Request('https://site.test/x', { method: 'GET' }))).status, 405)
  assert.equal((await handler(request(signup(), { 'content-type': 'text/plain' }))).status, 415)
  assert.equal((await handler(request('{not json'))).status, 400)
  assert.equal((await handler(request(signup({ fullName: 'x'.repeat(20_000) })))).status, 413)
  assert.equal(accounts.length, 0)
})

test('rows are sent as raw text, so input cannot run as a sheet formula', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options })
    return String(url).includes('oauth2') ? Response.json({ access_token: 'token', expires_in: 3600 }) : Response.json({})
  }
  const { generateKeyPairSync } = await import('node:crypto')
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'bot@example.iam.gserviceaccount.com'
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' })
  await appendStudioLeadRow(['=HYPERLINK("x")'], { env: { GOOGLE_SPREADSHEET_ID: 'sheet-id' }, fetchImpl })
  const append = calls.find((call) => call.url.includes('sheets.googleapis.com'))
  assert.match(append.url, /valueInputOption=RAW/)
  assert.match(decodeURIComponent(append.url), /'Studio Leads'!A:I/)
  await assert.rejects(appendStudioLeadRow([], { env: {}, fetchImpl }), /GOOGLE_SPREADSHEET_ID/)
})
