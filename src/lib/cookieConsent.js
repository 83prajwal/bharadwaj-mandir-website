// Earlier consent was collected while the site stated that analytics were disabled.
// A new key requests fresh permission before GA4 can be loaded.
export const cookieConsentKey = 'bm-cookie-choice-v2'
export const cookieConsentChangedEvent = 'bm-cookie-consent-changed'

export function getCookieConsent() {
  return localStorage.getItem(cookieConsentKey)
}

export function setCookieConsent(value) {
  localStorage.setItem(cookieConsentKey, value)
  window.dispatchEvent(new CustomEvent(cookieConsentChangedEvent, { detail: value }))
}
