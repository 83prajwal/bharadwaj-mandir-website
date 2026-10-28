import { useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { products } from '../data/products'

const uploadLimit = 7 * 1024 * 1024
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export default function EnquiryForm() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const requestInFlight = useRef(false)
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const sourceParams = new URLSearchParams(window.location.search)
  const selectedProduct = products.find((product) => product.id === query.get('productId'))
  const assistantQuestion = typeof location.state?.assistantQuestion === 'string' ? location.state.assistantQuestion.slice(0, 1200) : ''

  async function handleSubmit(event) {
    event.preventDefault()
    if (requestInFlight.current) return

    const form = event.currentTarget
    const fileInput = form.elements.referenceFile
    const file = fileInput.files[0]
    fileInput.setCustomValidity(file && !allowedTypes.includes(file.type) ? 'Upload a JPG, PNG, WebP or PDF file.' : '')
    if (file && file.size > uploadLimit) fileInput.setCustomValidity('Choose a file smaller than 7 MB.')
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
      setSubmitted(true)
      form.reset()
    } catch (submissionError) {
      console.error('Enquiry submission failed before a successful HTTP response.', submissionError)
      setError('We could not reach the form service or prepare your enquiry. No successful submission was confirmed; your entered details are still on this page.')
    } finally {
      requestInFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="enquiry-box">
      {submitted ? (
        <div className="success-state" role="status" aria-live="polite">
          <h2>Thank you for your enquiry.</h2>
          <p>The form service accepted your submission. The team can now review the project details you provided. This site cannot display a service-generated reference number.</p>
          <p>Destination feasibility, specifications and any quotation will need to be confirmed with the team.</p>
        </div>
      ) : (
        <form className="enquiry-form" name="enquiry" method="POST" action="/" data-netlify="true" data-netlify-honeypot="bot-field" encType="multipart/form-data" onSubmit={handleSubmit}>
          <input type="hidden" name="form-name" value="enquiry" />
          <input type="hidden" name="productId" value={query.get('productId') || ''} />
          <input type="hidden" name="productUrl" value={query.get('productUrl') || ''} />
          <input type="hidden" name="pageUrl" />
          <input type="hidden" name="landingPage" />
          {['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].map((name) => <input key={name} type="hidden" name={name} />)}
          <label className="honeypot" aria-hidden="true">Do not fill this out<input name="bot-field" tabIndex="-1" autoComplete="off" /></label>
          {query.get('productId') && <p className="field-help">Enquiry about: {selectedProduct?.name || 'a selected design'}{selectedProduct ? ` (${selectedProduct.id})` : ''}</p>}
          <div className="form-grid">
            <label><span>Full name *</span><input type="text" name="fullName" autoComplete="name" maxLength="120" required /></label>
            <label><span>Email *</span><input type="email" name="email" autoComplete="email" maxLength="254" required /></label>
            <label><span>Country *</span><input type="text" name="country" list="country-list" autoComplete="country-name" maxLength="100" required /><datalist id="country-list">{['United States', 'United Kingdom', 'Canada', 'Australia', 'United Arab Emirates', 'Singapore', 'New Zealand', 'India', 'Germany', 'France', 'Netherlands', 'Italy', 'Switzerland', 'Ireland', 'South Africa', 'Malaysia', 'Japan'].map((country) => <option key={country} value={country} />)}</datalist></label>
            <label><span>City</span><input type="text" name="city" autoComplete="address-level2" maxLength="100" /></label>
            <label><span>WhatsApp / phone (include country code)</span><input type="tel" name="phone" autoComplete="tel" pattern="[+()0-9 .-]{7,25}" title="Enter a phone number with country code." /></label>
            <label><span>Buyer type</span><select name="buyerType" defaultValue=""><option value="">Select if known</option><option>Homeowner</option><option>Interior designer</option><option>Architect</option><option>Temple committee</option><option>Dealer</option><option>Other</option></select></label>
            <label><span>Project interest *</span><select name="interest" required defaultValue={query.get('interest') || ''}><option value="" disabled>Select an interest</option><option>Home mandir</option><option>Custom mandir</option><option>Pooja room</option><option>Jali or carving</option><option>Project enquiry</option></select></label>
            <label><span>Approximate space or dimensions</span><input type="text" name="dimensions" maxLength="200" /></label>
            <label><span>Budget and currency (optional)</span><input type="text" name="budget" maxLength="100" placeholder="Not sure yet" /></label>
            <label><span>Desired timeline</span><input type="text" name="timeline" maxLength="100" /></label>
            <label><span>Delivery or installation</span><select name="deliveryNeeds" defaultValue=""><option value="" disabled>Select your preference</option><option value="With installation">With installation</option><option value="Without installation">Without installation</option><option value="Not sure yet">Not sure yet</option></select></label>
          </div>
          <label><span>Project message</span><textarea name="message" rows="5" maxLength="4000" defaultValue={assistantQuestion ? `Question from the website assistant: ${assistantQuestion}` : ''} /></label>
          <label><span>Reference image, drawing or floor plan</span><input type="file" name="referenceFile" accept="image/jpeg,image/png,image/webp,application/pdf" aria-describedby="reference-file-help" /><span id="reference-file-help" className="field-help">One JPG, PNG, WebP or PDF file, up to 7 MB.</span></label>
          <label className="consent-control"><input type="checkbox" name="privacyAcknowledged" value="yes" required /><span>I have read the <a href="/privacy">privacy notice</a> and agree that my details may be used to respond to this enquiry. *</span></label>
          <label className="consent-control"><input type="checkbox" name="marketingConsent" value="yes" /><span>I would like to receive occasional product and design updates. Optional.</span></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Submitting…' : 'Request a Custom Quote'}</button>
          <p className="field-help">A submission is confirmed only after the configured form provider accepts it. Destination, pricing, timing and installation feasibility are confirmed individually.</p>
        </form>
      )}
    </div>
  )
}
