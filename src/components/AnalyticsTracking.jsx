import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cookieConsentChangedEvent, getCookieConsent } from '../lib/cookieConsent'

const measurementId = 'G-R2FN7N8BP9'
const scriptId = 'bm-ga4-script'
const initializedKey = '__bmGa4Initialized'
const lastTrackedPathKey = '__bmGa4LastTrackedPath'

function isAnalyticsAllowed() {
  return getCookieConsent() === 'accepted'
}

function disableAnalytics() {
  window[`ga-disable-${measurementId}`] = true
}

function initializeAnalytics() {
  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments) }
  window[`ga-disable-${measurementId}`] = false
  if (window[initializedKey]) return

  if (!document.getElementById(scriptId)) {
    const script = document.createElement('script')
    script.id = scriptId
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
    document.head.append(script)
  }

  window.gtag('js', new Date())
  window.gtag('config', measurementId, { send_page_view: false })
  window[initializedKey] = true
}

function trackPageView(pathname) {
  if (window[lastTrackedPathKey] === pathname) return

  window.gtag('event', 'page_view', {
    page_title: document.title,
    page_location: `${window.location.origin}${pathname}`,
  })
  window[lastTrackedPathKey] = pathname
}

export default function AnalyticsTracking() {
  const { pathname } = useLocation()
  const [allowed, setAllowed] = useState(isAnalyticsAllowed)

  useEffect(() => {
    function updateConsent() {
      const accepted = isAnalyticsAllowed()
      setAllowed(accepted)
      if (!accepted) disableAnalytics()
    }

    window.addEventListener(cookieConsentChangedEvent, updateConsent)
    return () => window.removeEventListener(cookieConsentChangedEvent, updateConsent)
  }, [])

  useEffect(() => {
    if (!allowed) return
    initializeAnalytics()
    trackPageView(pathname)
  }, [allowed, pathname])

  return null
}
