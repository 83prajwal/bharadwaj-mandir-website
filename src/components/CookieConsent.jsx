import { useEffect, useState } from 'react'
import { getCookieConsent, setCookieConsent } from '../lib/cookieConsent'
import { openCookieSettingsEvent } from '../lib/siteEvents'

export default function CookieConsent() {
  const [customizing, setCustomizing] = useState(false)
  const [show, setShow] = useState(() => !getCookieConsent())
  useEffect(() => {
    const open = () => setShow(true)
    window.addEventListener(openCookieSettingsEvent, open)
    return () => window.removeEventListener(openCookieSettingsEvent, open)
  }, [])
  function save(value) {
    setCookieConsent(value)
    setShow(false)
    setCustomizing(false)
  }
  return <>
    {show && <aside className="cookie-banner" aria-label="Cookie preferences" aria-live="polite">
      <div><strong>Cookie preferences</strong><p>Essential site storage keeps your preference. Optional analytics are used only if you accept.</p>{customizing && <p>Optional analytics measure page visits and navigation. They do not receive enquiry details or other form information.</p>}</div>
      <div className="cookie-actions"><button type="button" className="btn btn-secondary" onClick={() => save('rejected')}>Reject non-essential</button><button type="button" className="btn btn-secondary" onClick={() => setCustomizing((value) => !value)}>Customise</button><button type="button" className="btn btn-primary" onClick={() => save('accepted')}>Accept</button></div>
    </aside>}
  </>
}
