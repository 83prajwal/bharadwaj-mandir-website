import { createHash } from 'node:crypto'
import { getGoogleAccessToken } from './lead-management.mjs'

export const MAX_STUDIO_LEAD_BODY_BYTES = 16_000
export const STUDIO_LEAD_HEADERS = ['Date', 'Name', 'Phone', 'Email', 'Design interest', 'Design details', 'Consent', 'Status', 'Notes']
const RATE_LIMITS = { signup: 5, quotation: 20 }
const RATE_WINDOW_MS = 60 * 60 * 1000
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const hash = (value) => createHash('sha256').update(value).digest('hex')
const text = (value, maxLength) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength) : '')
function invalid(message) { throw Object.assign(new Error(message), { status: 400 }) }

function json(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

// Accepts 10 digits with an optional +91, 91 or 0 prefix. Returns +91XXXXXXXXXX.
export function normalizeIndianPhone(value) {
  const digits = text(value, 25).replace(/[\s().-]/g, '')
  const match = digits.match(/^(?:\+?91|0)?([6-9]\d{9})$/)
  return match ? `+91${match[1]}` : null
}

export function validateSignup(body) {
  const fullName = text(body.fullName, 121)
  const email = text(body.email, 255).toLowerCase()
  const phone = normalizeIndianPhone(body.phone)
  const password = typeof body.password === 'string' ? body.password : ''
  if (fullName.length < 2 || fullName.length > 120) invalid('Enter your full name.')
  if (!phone) invalid('Enter a valid 10-digit Indian mobile number.')
  if (email.length > 254 || !emailPattern.test(email)) invalid('Enter a valid email address.')
  if (password.length < 8 || password.length > 72) invalid('Choose a password of 8 to 72 characters.')
  if (body.consent !== true) invalid('Please agree to be contacted about your design.')
  return { fullName, email, phone, password }
}

export function formatDesignDetails(design) {
  const source = design && typeof design === 'object' ? design : {}
  const size = (value) => (Number.isFinite(value) && value > 0 && value <= 100_000 ? `${Math.round(value)} mm` : 'Not set')
  const label = (value) => text(value, 40) || 'Not set'
  const pillars = Number.isInteger(source.pillars) && source.pillars >= 0 && source.pillars <= 20 ? source.pillars : 'Not set'
  return `Width: ${size(source.width)}; Height: ${size(source.height)}; Style: ${label(source.style)}; Marble: ${label(source.material)}; Pillars: ${pillars}`
}

export function buildStudioLeadRow({ date, name, phone, email, interest, details = '', consent }) {
  return [date, name, phone, email, interest, details, consent ? 'Yes' : 'No', 'New', '']
}

// RAW keeps every value as plain text, so customer input cannot run as a sheet formula.
export async function appendStudioLeadRow(row, { env = process.env, fetchImpl = fetch } = {}) {
  const spreadsheetId = env.GOOGLE_SPREADSHEET_ID?.trim()
  if (!spreadsheetId) throw new Error('Missing required server configuration: GOOGLE_SPREADSHEET_ID')
  const tab = (env.GOOGLE_STUDIO_LEADS_TAB || 'Studio Leads').replaceAll("'", "''")
  const token = await getGoogleAccessToken(fetchImpl)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${tab}'!A:I`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`Google Sheets append failed (HTTP ${response.status}).`)
}

function isSameOrigin(request) {
  try {
    const origin = request.headers.get('origin')
    return Boolean(origin) && new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

function isDuplicateAccount(error) {
  return (error?.status === 400 || error?.status === 422) && /already|registered|exists/i.test(error?.message || '')
}

export function createStudioLeadHandler({
  store,
  createAccount,
  currentUser,
  appendRow = appendStudioLeadRow,
  now = () => new Date(),
  timeZone = () => process.env.REPORT_TIMEZONE || 'Asia/Kolkata',
}) {
  const leadDate = () => now().toLocaleString('en-IN', { timeZone: timeZone(), dateStyle: 'medium', timeStyle: 'short' })

  // Stored in Netlify Blobs so the limit holds across function instances.
  async function isRateLimited(action, client) {
    const key = `rate/${action}/${hash(client)}`
    const window = Math.floor(now().getTime() / RATE_WINDOW_MS)
    try {
      const record = await store.get(key, { type: 'json' })
      const count = record?.window === window ? record.count : 0
      if (count >= RATE_LIMITS[action]) return true
      await store.setJSON(key, { window, count: count + 1 })
    } catch (error) {
      console.error('Studio lead rate limit storage failed.', error.message)
    }
    return false
  }

  // The marker is claimed before writing, so one email address can only ever add
  // one sign-up row, even with a double submit or a repeated unconfirmed sign-up.
  async function saveOnce(markerKey, row) {
    const claim = await store.setJSON(markerKey, { at: now().toISOString() }, { onlyIfNew: true })
    if (!claim.modified) return true
    try {
      await appendRow(row)
      return true
    } catch (error) {
      await store.delete(markerKey).catch(() => undefined)
      console.error('Studio lead could not be saved.', error.message)
      return false
    }
  }

  async function signupLead(body, request, context) {
    if (await isRateLimited('signup', context.ip || request.headers.get('x-nf-client-connection-ip') || 'unknown')) {
      return json(429, { error: 'Too many attempts. Please try again in a while.' })
    }
    if (text(body.website, 200)) return json(200, { ok: true, saved: true, confirmationRequired: true })
    const lead = validateSignup(body)
    let user
    try {
      user = await createAccount(lead.email, lead.password, { full_name: lead.fullName, phone: lead.phone, contact_consent: true })
    } catch (error) {
      if (isDuplicateAccount(error)) return json(409, { error: 'An account with this email already exists. Please log in.' })
      console.error('Studio account could not be created.', error?.status || '', error?.message || '')
      return json(502, { error: 'We could not create your account right now.' })
    }
    const saved = await saveOnce(`signup/${hash(lead.email)}`, buildStudioLeadRow({
      date: leadDate(), name: lead.fullName, phone: lead.phone, email: lead.email, interest: '3D Studio sign-up', consent: true,
    }))
    return json(200, { ok: true, saved, confirmationRequired: !user?.confirmedAt })
  }

  async function quotationLead(body) {
    const user = await currentUser()
    if (!user?.email) return json(401, { error: 'Please log in to request a quotation.' })
    if (await isRateLimited('quotation', user.id || user.email)) return json(429, { error: 'Too many requests. Please try again in a while.' })
    if (text(body.website, 200)) return json(200, { ok: true, saved: true })
    const designName = text(body.designName, 80)
    if (!designName) invalid('The design name is missing.')
    const details = formatDesignDetails(body.design)
    const metadata = user.userMetadata || {}
    // One row per design per account: repeat clicks on an unchanged design add nothing.
    const saved = await saveOnce(`quotation/${hash(`${user.id || user.email}|${designName}|${details}`)}`, buildStudioLeadRow({
      date: leadDate(),
      name: text(metadata.full_name, 120) || text(user.name, 120),
      phone: text(metadata.phone, 25),
      email: user.email,
      interest: `Quotation: ${designName}`,
      details,
      consent: metadata.contact_consent === true,
    }))
    return saved ? json(200, { ok: true, saved: true }) : json(503, { error: 'Your request could not be saved.' })
  }

  return async function studioLead(request, context = {}) {
    if (request.method !== 'POST') return json(405, { error: 'Use POST.' })
    if (!isSameOrigin(request)) return json(403, { error: 'This request could not be accepted.' })
    if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json(415, { error: 'Send a JSON request.' })
    let body
    try {
      const raw = await request.text()
      if (Buffer.byteLength(raw, 'utf8') > MAX_STUDIO_LEAD_BODY_BYTES) return json(413, { error: 'The request is too large.' })
      body = JSON.parse(raw)
    } catch {
      return json(400, { error: 'The request could not be read.' })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'The request could not be read.' })
    try {
      if (body.action === 'signup') return await signupLead(body, request, context)
      if (body.action === 'quotation') return await quotationLead(body)
      return json(400, { error: 'Unknown request.' })
    } catch (error) {
      if (error.status === 400) return json(400, { error: error.message })
      console.error('Studio lead request failed.', error.message)
      return json(500, { error: 'Something went wrong.' })
    }
  }
}
