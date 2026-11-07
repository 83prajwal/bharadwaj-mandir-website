import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { defaults } from '../src/pages/mandir-studio/lib/config.ts'
import { validateQuotationRequest } from '../netlify/functions/lib/quotation-request.mjs'
import handler from '../netlify/functions/quotation-validate.mjs'
import vercelQuotationValidate from '../api/quotation-validate.js'
import quotationAcknowledgement, { createQuotationAcknowledgement } from '../netlify/functions/quotation-acknowledgement.mjs'
import { createSpecificationPdf, safePdfFilename } from '../src/pages/mandir-studio/lib/specification-pdf.mjs'
import { activeConfigEntries } from '../src/pages/mandir-studio/lib/config.ts'
import { parseQuotationValidationResponse } from '../src/lib/quotation-response.mjs'

function validForm(overrides = {}) {
  const form = new FormData()
  const fields = {
    fullName: 'Asha Rao', email: 'asha@example.com', phone: '+91 98765 43210', city: 'Bengaluru',
    installationLocation: 'Indiranagar', privacyAcknowledged: 'yes', designName: 'Home Mandir',
    designId: '5d4c9a58-bb26-4cc6-89f7-21d2dc96d870', designConfiguration: JSON.stringify(defaults),
    quotationReference: 'bm-ref-1',
  }
  for (const [key, value] of Object.entries({ ...fields, ...overrides })) form.set(key, value)
  return form
}

async function callVercelNodeHandler(request) {
  const url = new URL(request.url)
  const input = request.method === 'GET' || request.method === 'HEAD'
    ? Readable.from([])
    : Readable.from([Buffer.from(await request.clone().arrayBuffer())])
  input.method = request.method
  input.url = `${url.pathname}${url.search}`
  input.headers = {
    ...Object.fromEntries(request.headers.entries()),
    host: url.host,
    'x-forwarded-proto': url.protocol.slice(0, -1),
  }

  const responseHeaders = new Headers()
  const output = {
    statusCode: 200,
    setHeader(name, value) { responseHeaders.set(name, value) },
    end(body) { this.body = body },
  }
  const returned = await vercelQuotationValidate(input, output)
  return {
    returned,
    response: new Response(output.body, { status: output.statusCode, headers: responseHeaders }),
  }
}

async function compareNetlifyAndVercel(request) {
  const { returned, response: vercelResponse } = await callVercelNodeHandler(request)
  const netlifyResponse = await handler(request)
  assert.equal(returned, undefined, 'Vercel Node handler must send through res, not return a Web Response')
  assert.equal(vercelResponse.status, netlifyResponse.status)
  assert.deepEqual([...vercelResponse.headers], [...netlifyResponse.headers])
  assert.equal(await vercelResponse.clone().text(), await netlifyResponse.clone().text())
  const [vercelPayload, netlifyPayload] = await Promise.all([vercelResponse.json(), netlifyResponse.json()])
  assert.deepEqual(vercelPayload, netlifyPayload)
  return { netlifyResponse, netlifyPayload, vercelResponse, vercelPayload }
}

test('frontend accepts JSON validation success and surfaces JSON validation errors', async () => {
  const success = await parseQuotationValidationResponse(new Response(JSON.stringify({ ok: true, designName: 'Home Mandir' }), { status: 200, headers: { 'content-type': 'application/json' } }))
  assert.equal(success.designName, 'Home Mandir')
  await assert.rejects(
    parseQuotationValidationResponse(new Response(JSON.stringify({ error: 'Enter the installation city.' }), { status: 400, headers: { 'content-type': 'application/json' } })),
    /Enter the installation city/,
  )
})

test('frontend diagnoses missing HTML function routes and empty gateway responses without submitting', async () => {
  await assert.rejects(
    parseQuotationValidationResponse(new Response('<!doctype html><html><body>Not found</body></html>', { status: 404, headers: { 'content-type': 'text/html' } })),
    /function was not reached.*HTTP 404.*text\/html/,
  )
  await assert.rejects(
    parseQuotationValidationResponse(new Response('', { status: 502 })),
    /function or Netlify gateway failed.*HTTP 502.*text\/plain/,
  )
  await assert.rejects(
    parseQuotationValidationResponse(new Response('<html><body>Gateway error</body></html>', { status: 502, headers: { 'content-type': 'text/html' } })),
    /function or Netlify gateway failed.*HTTP 502.*text\/html/,
  )
  await assert.rejects(
    parseQuotationValidationResponse(new Response(JSON.stringify({ message: 'unexpected' }), { status: 200, headers: { 'content-type': 'application/json' } })),
    /unexpected JSON response/,
  )
})

test('server accepts a complete valid Studio quotation request and validated configuration', async () => {
  const result = await validateQuotationRequest(validForm())
  assert.equal(result.name, 'Asha Rao')
  assert.equal(result.designName, 'Home Mandir')
  assert.equal(result.config.width, defaults.width)
})

test('server rejects invalid contact, location, consent and configuration values', async () => {
  for (const fields of [
    { email: 'bad-email' }, { phone: '123' }, { city: '' }, { installationLocation: '' },
    { privacyAcknowledged: 'no' }, { designConfiguration: '{bad json' },
    { designConfiguration: JSON.stringify({ ...defaults, width: -1 }) },
  ]) await assert.rejects(validateQuotationRequest(validForm(fields)), /valid|Enter|Consent|configuration|design/i)
})

test('server allows only same-site public read-only share links and rejects private or external links', async () => {
  const token = 'a'.repeat(43)
  const allowed = validForm({ sharedDesignLink: `https://site.test/mandir-designer#share=${token}` })
  await validateQuotationRequest(allowed, { siteOrigin: 'https://site.test' })
  for (const url of [
    `https://other.test/mandir-designer#share=${token}`,
    `https://site.test/mandir-designer?ownerSecret=private#share=${token}`,
    'https://site.test/mandir-designer#ownerSecret=private',
  ]) await assert.rejects(validateQuotationRequest(validForm({ sharedDesignLink: url }), { siteOrigin: 'https://site.test' }), /public read-only/)
})

test('server accepts only allowed file signatures and enforces upload type and size limits', async () => {
  const jpg = new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], 'room.jpg', { type: 'image/jpeg' })
  const accepted = validForm(); accepted.set('referenceFile', jpg)
  await validateQuotationRequest(accepted)
  const bad = validForm(); bad.set('referenceFile', new File(['not a jpeg'], 'room.jpg', { type: 'image/jpeg' }))
  await assert.rejects(validateQuotationRequest(bad), /content does not match/)
  const unsupported = validForm(); unsupported.set('referenceFile', new File(['x'], 'room.svg', { type: 'image/svg+xml' }))
  await assert.rejects(validateQuotationRequest(unsupported), /Upload a JPG/)
  const large = validForm(); large.set('referenceFile', new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' }))
  await assert.rejects(validateQuotationRequest(large), /3 MB or smaller/)
})

test('validation function rejects bad method and cross-origin requests and accepts same-origin multipart requests', async () => {
  const method = await handler(new Request('https://site.test/.netlify/functions/quotation-validate'))
  assert.equal(method.status, 405)
  const cross = await handler(new Request('https://site.test/.netlify/functions/quotation-validate', { method: 'POST', headers: { origin: 'https://other.test' }, body: validForm() }))
  assert.equal(cross.status, 403)
  const request = new Request('https://site.test/.netlify/functions/quotation-validate', { method: 'POST', headers: { origin: 'https://site.test' }, body: validForm() })
  const response = await handler(request)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).designName, 'Home Mandir')
})

test('Vercel quotation endpoint matches Netlify for a valid multipart quotation', async () => {
  const form = validForm()
  form.set('referenceFile', new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], 'room.jpg', { type: 'image/jpeg' }))
  const request = new Request('https://site.test/api/quotation-validate', {
    method: 'POST', headers: { origin: 'https://site.test' }, body: form,
  })
  const { vercelResponse, vercelPayload } = await compareNetlifyAndVercel(request)
  assert.equal(vercelPayload.designName, 'Home Mandir')
})

test('Vercel quotation endpoint matches Netlify for missing required fields', async () => {
  const form = validForm({ city: '' })
  const request = new Request('https://site.test/api/quotation-validate', {
    method: 'POST', headers: { origin: 'https://site.test' }, body: form,
  })
  const { vercelResponse, vercelPayload } = await compareNetlifyAndVercel(request)
  assert.equal(vercelResponse.status, 400)
  assert.match(vercelPayload.error, /installation city/i)
})

test('Vercel quotation endpoint matches Netlify for invalid and oversized reference files', async () => {
  const invalidFile = validForm()
  invalidFile.set('referenceFile', new File(['bad signature'], 'sketch.svg', { type: 'image/svg+xml' }))
  const invalidRequest = new Request('https://site.test/api/quotation-validate', {
    method: 'POST', headers: { origin: 'https://site.test' }, body: invalidFile,
  })
  const invalid = await compareNetlifyAndVercel(invalidRequest)
  assert.equal(invalid.vercelResponse.status, 400)
  assert.match(invalid.vercelPayload.error, /Upload a JPG, PNG, WebP or PDF/)

  const oversizedFile = validForm()
  oversizedFile.set('referenceFile', new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' }))
  const oversizedRequest = new Request('https://site.test/api/quotation-validate', {
    method: 'POST', headers: { origin: 'https://site.test' }, body: oversizedFile,
  })
  const oversized = await compareNetlifyAndVercel(oversizedRequest)
  assert.equal(oversized.vercelResponse.status, 400)
  assert.match(oversized.vercelPayload.error, /3 MB or smaller/)
})

test('Vercel quotation endpoint matches Netlify for method, origin and malformed multipart errors', async () => {
  const wrongMethod = await compareNetlifyAndVercel(new Request('https://site.test/api/quotation-validate'))
  assert.equal(wrongMethod.vercelResponse.status, 405)

  const wrongOrigin = await compareNetlifyAndVercel(new Request('https://site.test/api/quotation-validate', {
    method: 'POST', headers: { origin: 'https://attacker.test', 'content-type': 'multipart/form-data; boundary=example' }, body: 'ignored',
  }))
  assert.equal(wrongOrigin.vercelResponse.status, 403)

  const malformed = await compareNetlifyAndVercel(new Request('https://site.test/api/quotation-validate', {
    method: 'POST', headers: { origin: 'https://site.test', 'content-type': 'multipart/form-data; boundary=example' }, body: 'not multipart data',
  }))
  assert.equal(malformed.vercelResponse.status, 400)
})

test('customer acknowledgement sends only after a verified Studio form event and is idempotent', async () => {
  const calls = []
  const send = createQuotationAcknowledgement({
    env: { RESEND_API_KEY: 'server-only-key', CUSTOMER_ACK_FROM_EMAIL: 'Bharadwaj <studio@example.com>' },
    fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response('{}', { status: 200 }) },
  })
  await send({ data: { 'form-name': 'enquiry', enquiryType: 'Website enquiry', email: 'ordinary@example.com' } })
  assert.equal(calls.length, 0)
  await send({ data: {
    'form-name': 'enquiry', enquiryType: '3D Studio quotation request', email: 'asha@example.com',
    fullName: 'Asha Rao', designName: '<Home Mandir>', quotationReference: 'request-123', phone: '+91-private',
  } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.resend.com/emails')
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'bharadwaj-quotation-ack-request-123')
  const payload = JSON.parse(calls[0].options.body)
  assert.deepEqual(payload.to, ['asha@example.com'])
  assert.match(payload.text, /request-123/)
  assert.match(payload.html, /&lt;Home Mandir&gt;/)
  assert.doesNotMatch(payload.text, /\+91-private/)
})

test('acknowledgement export supports HTTP requests without exposing an email-sending endpoint', async () => {
  assert.equal(typeof quotationAcknowledgement.fetch, 'function')
  assert.equal(typeof quotationAcknowledgement.formSubmitted, 'function')
  const response = await quotationAcknowledgement.fetch(new Request('https://site.test/.netlify/functions/quotation-acknowledgement'))
  assert.equal(response.status, 404)
  assert.match((await response.json()).error, /only after a verified 3D Studio form submission/)
})

test('customer acknowledgement does not claim delivery when sender configuration is missing and reports provider errors', async () => {
  let calls = 0
  const event = { data: { 'form-name': 'enquiry', enquiryType: '3D Studio quotation request', email: 'asha@example.com', quotationReference: 'request-124' } }
  await assert.rejects(
    createQuotationAcknowledgement({ env: {}, fetchImpl: async () => { calls += 1 } })(event),
    /QUOTATION_ACK_CONFIG_MISSING_RESEND_API_KEY/,
  )
  await assert.rejects(
    createQuotationAcknowledgement({ env: { RESEND_API_KEY: 'secret' }, fetchImpl: async () => { calls += 1 } })(event),
    /QUOTATION_ACK_CONFIG_MISSING_CUSTOMER_ACK_FROM_EMAIL/,
  )
  assert.equal(calls, 0)
  const send = createQuotationAcknowledgement({ env: { RESEND_API_KEY: 'secret', CUSTOMER_ACK_FROM_EMAIL: 'studio@example.com' }, fetchImpl: async () => new Response('', { status: 503 }) })
  await assert.rejects(send(event), /QUOTATION_ACK_EMAIL_HTTP_503/)
})

test('PDF specification is downloadable, branded, paginated and uses configured design values', () => {
  const config = { ...defaults, width: 1450, style: 'Modern', material: 'Black' }
  const doc = createSpecificationPdf({ name: 'Home Mandir', designId: '5d4c9a58-bb26-4cc6-89f7-21d2dc96d870', entries: activeConfigEntries(config), customerRequirements: `Fit the north wall. ${'Long requirement detail. '.repeat(350)}` })
  const pdf = doc.output()
  const pageText = doc.internal.pages.map((page) => page.join('')).join('')
  assert.ok(pdf.startsWith('%PDF-'))
  assert.ok(doc.getNumberOfPages() > 3)
  assert.match(pageText, /1450 mm/)
  assert.match(pageText, /Modern/)
  assert.match(pageText, /Black/)
  assert.match(pageText, /Long requirement detail\./)
  assert.equal(safePdfFilename('Home Mandir'), 'Home-Mandir-quotation-specification.pdf')
})
