const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])

export function createQuotationAcknowledgement({ fetchImpl = fetch, env = process.env } = {}) {
  return async function formSubmitted(event) {
    const data = event?.data
    if (!data || data.formName !== 'enquiry' && data['form-name'] !== 'enquiry') return
    if (data.enquiryType !== '3D Studio quotation request') return

    const email = typeof data.email === 'string' ? data.email.trim().slice(0, 254) : ''
    const name = typeof data.fullName === 'string' ? data.fullName.trim().slice(0, 120) : ''
    const designName = typeof data.designName === 'string' ? data.designName.trim().slice(0, 80) : 'your mandir design'
    const reference = typeof data.quotationReference === 'string' ? data.quotationReference.trim().slice(0, 80) : ''
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !reference) return

    const apiKey = env.RESEND_API_KEY
    const from = env.CUSTOMER_ACK_FROM_EMAIL
    if (!apiKey) throw new Error('QUOTATION_ACK_CONFIG_MISSING_RESEND_API_KEY')
    if (!from) throw new Error('QUOTATION_ACK_CONFIG_MISSING_CUSTOMER_ACK_FROM_EMAIL')

    const greeting = name ? `Hello ${name},` : 'Hello,'
    const subject = `We received your Bharadwaj Mandir quotation request (${reference})`
    const text = `${greeting}\n\nWe received your quotation request for “${designName}”. The team will review your design and requirements. This is an acknowledgement of your request, not an approved commercial quotation.\n\nRequest reference: ${reference}\n\nBharadwaj Mandir`
    const html = `<p>${escapeHtml(greeting)}</p><p>We received your quotation request for <strong>${escapeHtml(designName)}</strong>. The team will review your design and requirements. This is an acknowledgement of your request, not an approved commercial quotation.</p><p>Request reference: <strong>${escapeHtml(reference)}</strong></p><p>Bharadwaj Mandir</p>`
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `bharadwaj-quotation-ack-${reference}` },
      body: JSON.stringify({ from, to: [email], subject, text, html }),
    })
    if (!response.ok) throw new Error(`QUOTATION_ACK_EMAIL_HTTP_${response.status}`)
  }
}

async function fetchHandler() {
  return Response.json(
    { error: 'Quotation acknowledgements are sent only after a verified 3D Studio form submission.' },
    { status: 404, headers: { 'cache-control': 'no-store' } },
  )
}

export default {
  fetch: fetchHandler,
  formSubmitted: createQuotationAcknowledgement(),
}
