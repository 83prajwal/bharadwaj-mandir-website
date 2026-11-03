import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { products } from '../data/products'
import { parseQuotationValidationResponse } from '../lib/quotation-response.mjs'

const uploadLimit = 7 * 1024 * 1024
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export default function EnquiryForm() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [shareDesign, setShareDesign] = useState(false)
  const [submittedReference, setSubmittedReference] = useState('')
  const [quotationReference] = useState(() => globalThis.crypto?.randomUUID?.() || `BM-${Date.now()}`)
  const requestInFlight = useRef(false)
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const sourceParams = new URLSearchParams(window.location.search)
  const selectedProduct = products.find((product) => product.id === query.get('productId'))
  const assistantQuestion = typeof location.state?.assistantQuestion === 'string' ? location.state.assistantQuestion.slice(0, 1200) : ''
  const designerConfig = location.state?.designerConfig && typeof location.state.designerConfig === 'object' ? location.state.designerConfig : null
  const designerQuote = Boolean(location.state?.designerQuote && designerConfig)
  const designerName = typeof location.state?.designerName === 'string' ? location.state.designerName.slice(0, 80) : 'Mandir design'
  const designerId = typeof location.state?.designerId === 'string' ? location.state.designerId : ''
  const designerShareUrl = typeof location.state?.designerShareUrl === 'string' ? location.state.designerShareUrl : ''
  const designerFields = ['installation', 'style', 'width', 'depth', 'height', 'pillars', 'pillarShape', 'roof', 'material', 'finish', 'backPanel', 'sides', 'doors', 'storage', 'drawerCount', 'lighting']
  const designerSummary = designerConfig
    ? `3D Studio design: ${typeof location.state?.designerName === 'string' ? location.state.designerName.slice(0, 80) : 'Mandir design'}\n${designerFields.filter((key) => designerConfig[key] !== undefined).map((key) => `${key}: ${String(designerConfig[key]).slice(0, 100)}`).join('\n')}${typeof designerConfig.requirements === 'string' && designerConfig.requirements.trim() ? `\nDesign requirements: ${designerConfig.requirements.slice(0, 1200)}` : ''}`
    : ''
  const initialMessage = [assistantQuestion ? `Question from the website assistant: ${assistantQuestion}` : '', designerSummary].filter(Boolean).join('\n\n').slice(0, 3800)

  async function handleSubmit(event) {
    event.preventDefault()
    if (requestInFlight.current) return

    const form = event.currentTarget
    const fileInput = form.elements.referenceFile
    const file = fileInput.files[0]
    fileInput.setCustomValidity(file && !allowedTypes.includes(file.type) ? 'Upload a JPG, PNG, WebP or PDF file.' : '')
    if (file && file.size > (designerQuote ? 3 * 1024 * 1024 : uploadLimit)) fileInput.setCustomValidity(`Choose a file smaller than ${designerQuote ? '3' : '7'} MB.`)
    if (!form.reportValidity()) return

    setError('')
    const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    if (isLocalHost) {
      setError('A local preview cannot deliver enquiries. Submit a test from the deployed Netlify site.')
      return
    }

    requestInFlight.current = true
    setSubmitting(true)
    try {
      form.elements.pageUrl.value = window.location.href
      form.elements.landingPage.value = sessionStorage.getItem('bm-landing-page') || window.location.pathname
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
        form.elements[key].value = sourceParams.get(key) || sessionStorage.getItem(`bm-${key}`) || ''
      }
      const body = new FormData(form)
      if (designerQuote) {
        const validationResponse = await fetch('/.netlify/functions/quotation-validate', { method: 'POST', body })
        await parseQuotationValidationResponse(validationResponse)
      }
      const request = file
        ? { method: 'POST', body }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams([...body.entries()].filter(([name]) => name !== 'referenceFile')).toString(),
          }
      const response = await fetch('/', request)
      if (!response.ok) {
        console.error(`Netlify Forms returned HTTP ${response.status} for the enquiry submission.`)
        setError(`The form service returned an HTTP ${response.status} response. Your enquiry was not confirmed; please try again later.`)
        return
      }
      if (designerQuote) setSubmittedReference(quotationReference)
      setSubmitted(true)
      form.reset()
    } catch (submissionError) {
      console.error('Enquiry submission failed before a successful HTTP response.', submissionError)
      setError(submissionError instanceof TypeError
        ? 'We could not reach the form service. No successful submission was confirmed; your entered details are still on this page.'
        : `${submissionError.message || 'The submission could not be prepared.'} Your entered details are still on this page.`)
    } finally {
      requestInFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="enquiry-box">
      {submitted ? (
        <div className="success-state" role="status" aria-live="polite">
          <h2>{designerQuote ? 'Your quotation request has been submitted.' : 'Thank you for your enquiry.'}</h2>
          {designerQuote ? <><p><strong>{designerName}</strong> (request reference: {submittedReference})</p><p>The form service accepted your request. The Bharadwaj Mandir team will review the design and requirements you provided. No commercial quotation has been issued.</p><Link className="btn btn-primary" to="/mandir-designer">Return to the 3D Studio</Link></> : <><p>The form service accepted your submission. The team can now review the project details you provided. This site cannot display a service-generated reference number.</p><p>Destination feasibility, specifications and any quotation will need to be confirmed with the team.</p></>}
        </div>
      ) : (
        <form className="enquiry-form" name="enquiry" method="POST" action="/" data-netlify="true" data-netlify-honeypot="bot-field" encType="multipart/form-data" onSubmit={handleSubmit}>
          <input type="hidden" name="form-name" value="enquiry" />
          <input type="hidden" name="productId" value={query.get('productId') || ''} />
          <input type="hidden" name="productUrl" value={query.get('productUrl') || ''} />
        <input type="hidden" name="enquiryType" value={designerQuote ? '3D Studio quotation request' : 'Website enquiry'} />
        <input type="hidden" name="designId" value={designerQuote ? designerId : ''} />
        <input type="hidden" name="designName" value={designerQuote ? designerName : ''} />
        <input type="hidden" name="designConfiguration" value={designerQuote ? JSON.stringify(designerConfig) : ''} />
        <input type="hidden" name="sharedDesignLink" value={designerQuote && shareDesign ? designerShareUrl : ''} />
        <input type="hidden" name="quotationReference" value={designerQuote ? quotationReference : ''} />
          <input type="hidden" name="pageUrl" />
          <input type="hidden" name="landingPage" />
          {['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].map((name) => <input key={name} type="hidden" name={name} />)}
          <label className="honeypot" aria-hidden="true">Do not fill this out<input name="bot-field" tabIndex="-1" autoComplete="off" /></label>
          {query.get('productId') && <p className="field-help">Enquiry about: {selectedProduct?.name || 'a selected design'}{selectedProduct ? ` (${selectedProduct.id})` : ''}</p>}
          {designerQuote && <div className="field-help"><strong>Quotation request for: {designerName}</strong><p>Your current design configuration will be included for review. This is a request for review, not an approved quotation.</p></div>}
          <div className="form-grid">
            <label><span>Full name *</span><input type="text" name="fullName" autoComplete="name" maxLength="120" required /></label>
            <label><span>Email *</span><input type="email" name="email" autoComplete="email" maxLength="254" required /></label>
            <label><span>Country *</span><input type="text" name="country" list="country-list" autoComplete="country-name" maxLength="100" required /><datalist id="country-list">{['United States', 'United Kingdom', 'Canada', 'Australia', 'United Arab Emirates', 'Singapore', 'New Zealand', 'India', 'Germany', 'France', 'Netherlands', 'Italy', 'Switzerland', 'Ireland', 'South Africa', 'Malaysia', 'Japan'].map((country) => <option key={country} value={country} />)}</datalist></label>
            <label><span>{designerQuote ? 'Installation city *' : 'City'}</span><input type="text" name="city" autoComplete="address-level2" maxLength="100" required={designerQuote} /></label>
            <label><span>WhatsApp / phone {designerQuote ? '*' : '(include country code)'}</span><input type="tel" name="phone" autoComplete="tel" pattern="[+()0-9 .-]{7,25}" title="Enter a phone number with country code." required={designerQuote} /></label>
            {designerQuote && <label className="form-grid-wide"><span>Installation location *</span><input type="text" name="installationLocation" autoComplete="street-address" maxLength="240" required placeholder="Address, neighbourhood or site details" /></label>}
            <label><span>Buyer type</span><select name="buyerType" defaultValue=""><option value="">Select if known</option><option>Homeowner</option><option>Interior designer</option><option>Architect</option><option>Temple committee</option><option>Dealer</option><option>Other</option></select></label>
            <label><span>Project interest *</span><select name="interest" required defaultValue={query.get('interest') || ''}><option value="" disabled>Select an interest</option><option>Home mandir</option><option>Custom mandir</option><option>Pooja room</option><option>Jali or carving</option><option>Project enquiry</option></select></label>
            <label><span>Approximate space or dimensions</span><input type="text" name="dimensions" maxLength="200" defaultValue={designerConfig ? `${designerConfig.width || ''} W × ${designerConfig.depth || ''} D × ${designerConfig.height || ''} H mm` : ''} /></label>
            <label><span>Budget range (optional)</span><input type="text" name="budget" maxLength="100" placeholder="Not sure yet" /></label>
            <label><span>Desired timeline</span><input type="text" name="timeline" maxLength="100" /></label>
            <label><span>Delivery or installation</span><select name="deliveryNeeds" defaultValue=""><option value="" disabled>Select your preference</option><option value="With installation">With installation</option><option value="Without installation">Without installation</option><option value="Not sure yet">Not sure yet</option></select></label>
          </div>
          <label><span>Project message</span><textarea name="message" rows="5" maxLength="4000" defaultValue={initialMessage} /></label>
          <label><span>Reference image, drawing or floor plan</span><input type="file" name="referenceFile" accept="image/jpeg,image/png,image/webp,application/pdf" aria-describedby="reference-file-help" /><span id="reference-file-help" className="field-help">One JPG, PNG, WebP or PDF file, up to {designerQuote ? '3' : '7'} MB.</span></label>
          {designerQuote && designerShareUrl && <label className="consent-control"><input type="checkbox" checked={shareDesign} onChange={(event) => setShareDesign(event.target.checked)} /><span>Include my read-only design share link so the team can view the 3D concept.</span></label>}
          <label className="consent-control"><input type="checkbox" name="privacyAcknowledged" value="yes" required /><span>I have read the <a href="/privacy">privacy notice</a> and agree that my details may be used to respond to this enquiry. *</span></label>
          <label className="consent-control"><input type="checkbox" name="marketingConsent" value="yes" /><span>I would like to receive occasional product and design updates. Optional.</span></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Submitting…' : designerQuote ? 'Submit quotation request' : 'Request a Custom Quote'}</button>
          <p className="field-help">A submission is confirmed only after the configured form provider accepts it. If email acknowledgement is configured, a confirmation is sent after Netlify verifies the request. Destination, pricing, timing and installation feasibility are confirmed individually.</p>
        </form>
      )}
    </div>
  )
}
