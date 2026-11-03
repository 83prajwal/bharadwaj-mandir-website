import { validateStoredDesign } from './design-storage.mjs'

export const MAX_QUOTE_FILE_BYTES = 3 * 1024 * 1024
export const MAX_QUOTE_BODY_BYTES = 4 * 1024 * 1024
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^[+()0-9 .-]{7,25}$/

function get(form, key) { const value = form.get(key); return typeof value === 'string' ? value.trim() : '' }
function invalid(message) { throw Object.assign(new Error(message), { status: 400 }) }

export async function validateQuotationRequest(form, { siteOrigin } = {}) {
  if (!(form instanceof FormData)) invalid('Send the quotation request as multipart form data.')
  const name = get(form, 'fullName')
  const email = get(form, 'email')
  const phone = get(form, 'phone')
  const city = get(form, 'city')
  const location = get(form, 'installationLocation')
  const consent = get(form, 'privacyAcknowledged')
  const designName = get(form, 'designName')
  const designId = get(form, 'designId')
  const sharedDesignLink = get(form, 'sharedDesignLink')
  if (name.length < 2 || name.length > 120) invalid('Enter your full name (2–120 characters).')
  if (email.length > 254 || !emailPattern.test(email)) invalid('Enter a valid email address.')
  if (!phonePattern.test(phone)) invalid('Enter a valid phone number with country code.')
  if (!city || city.length > 100) invalid('Enter the installation city.')
  if (!location || location.length > 240) invalid('Enter the installation location.')
  if (consent !== 'yes') invalid('Consent to be contacted is required.')
  if (!designName || designName.length > 80) invalid('The design name is missing or too long.')
  if (designId && !/^[a-f0-9-]{36}$/i.test(designId)) invalid('The design identifier is invalid.')
  if (get(form, 'message').length > 4000 || get(form, 'budget').length > 100 || get(form, 'timeline').length > 100) invalid('One of the optional enquiry fields is too long.')
  if (sharedDesignLink) {
    let link
    try { link = new URL(sharedDesignLink) } catch { invalid('The shared design link is invalid.') }
    if (!['http:', 'https:'].includes(link.protocol) || link.username || link.password || link.search
      || link.pathname !== '/mandir-designer' || !/^#share=[A-Za-z0-9_-]{43}$/.test(link.hash)
      || siteOrigin && link.origin !== siteOrigin) invalid('Only a public read-only design link can be attached to the request.')
  }

  let config
  try { config = JSON.parse(get(form, 'designConfiguration')) } catch { invalid('The design configuration is invalid.') }
  try { validateStoredDesign(config) } catch (error) { invalid(`The design configuration is invalid: ${error.message}`) }

  const file = form.get('referenceFile')
  if (file && typeof file.arrayBuffer === 'function' && file.size) {
    if (!allowedMimeTypes.has(file.type)) invalid('Upload a JPG, PNG, WebP or PDF reference file.')
    if (file.size > MAX_QUOTE_FILE_BYTES) invalid('The reference file must be 3 MB or smaller.')
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const validSignature = file.type === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
        : file.type === 'image/webp' ? String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
          : String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
    if (!validSignature) invalid('The reference file content does not match its selected file type.')
  }

  return { name, email, designName, config }
}
