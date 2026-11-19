import { useEffect, useRef, useState } from 'react'
import { getCookieConsent, setCookieConsent } from '../lib/cookieConsent'
import { openCookieSettingsEvent } from '../lib/siteEvents'

export default function CookieConsent() {
  const [customizing, setCustomizing] = useState(false)
  const [show, setShow] = useState(() => !getCookieConsent())
  const bannerRef = useRef(null)

  useEffect(() => {
    const open = () => setShow(true)
    window.addEventListener(openCookieSettingsEvent, open)
    return () => window.removeEventListener(openCookieSettingsEvent, open)
  }, [])

  useEffect(() => {
    if (!show) {
      document.body.classList.remove('has-cookie-banner')
      document.documentElement.style.removeProperty('--cookie-banner-height')
      return
    }
    document.body.classList.add('has-cookie-banner')
    const updateHeight = () => {
      if (bannerRef.current) {
        const height = bannerRef.current.offsetHeight
        document.documentElement.style.setProperty('--cookie-banner-height', `${height}px`)
      }
    }
    updateHeight()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateHeight) : null
    if (bannerRef.current && observer) observer.observe(bannerRef.current)
    window.addEventListener('resize', updateHeight)
    return () => {
      if (observer) observer.disconnect()
      window.removeEventListener('resize', updateHeight)
      document.body.classList.remove('has-cookie-banner')
      document.documentElement.style.removeProperty('--cookie-banner-height')
    }
  }, [show, customizing])

  function save(value) {
    setCookieConsent(value)
    setShow(false)
    setCustomizing(false)
  }
  return <>
    {show && <aside ref={bannerRef} className="cookie-banner" aria-label="Cookie preferences" aria-live="polite">
      <div><strong>Cookie preferences</strong><p>Essential site storage keeps your preference. Optional analytics are used only if you accept.</p>{customizing && <p>Optional analytics measure page visits and navigation. They do not receive enquiry details or other form information.</p>}</div>
      <div className="cookie-actions"><button type="button" className="btn btn-secondary" onClick={() => save('rejected')}>Reject non-essential</button><button type="button" className="btn btn-secondary" onClick={() => setCustomizing((value) => !value)}>Customise</button><button type="button" className="btn btn-primary" onClick={() => save('accepted')}>Accept</button></div>
    </aside>}
  </>
}
