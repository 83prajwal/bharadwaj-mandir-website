import { useEffect, useState } from 'react'
import TempleIcon from './TempleIcons'

// Always-visible ways to get in touch, plus back-to-top. Uses the phone number
// already published in the footer and contact page. Remove the WhatsApp link
// if +91-9953836555 is not on WhatsApp.
const number = '919953836555'
const text = 'Namaste Bharadwaj Mandir, I would like to enquire about a marble mandir.'

export default function FloatingContact() {
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const pastHero = window.scrollY > window.innerHeight * 0.6
        setShowTop(window.scrollY > window.innerHeight * 0.8)
        // On the home page the floating buttons wait until the hero is passed,
        // so they never cover the hero's own buttons (see theme.css).
        document.documentElement.toggleAttribute('data-past-hero', pastHero)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function backToTop() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }

  return (
    <>
      <div className="floating-stack">
        <a className="floating-contact floating-call" href={`tel:+${number}`} aria-label="Call Bharadwaj Mandir on +91-9953836555">
          <TempleIcon name="phone" size={22} />
          <span>Call us</span>
        </a>
        <a
          className="floating-contact"
          href={`https://wa.me/${number}?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with Bharadwaj Mandir on WhatsApp (opens in a new tab)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.5A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 1 1-4.2 15l-.3-.18-3.1.9.9-3-.2-.32a8.1 8.1 0 0 1 6.9-12.4Zm-3 3.9c-.2 0-.5.07-.75.35-.26.28-1 1-1 2.4s1.03 2.8 1.18 3c.14.2 2 3.2 4.9 4.35 2.4.95 2.9.76 3.4.7.52-.05 1.7-.7 1.94-1.37.24-.68.24-1.26.17-1.38-.07-.12-.26-.2-.55-.33-.28-.15-1.7-.84-1.96-.94-.26-.1-.45-.14-.64.14-.2.29-.74.94-.9 1.13-.17.2-.33.22-.62.07-.29-.14-1.2-.44-2.3-1.42-.85-.76-1.42-1.7-1.6-1.98-.16-.29-.02-.44.12-.58.13-.13.29-.33.43-.5.15-.17.2-.29.29-.48.1-.2.05-.37-.02-.5-.07-.15-.64-1.55-.88-2.12-.23-.55-.47-.48-.64-.49h-.55Z" />
          </svg>
          <span>Chat on WhatsApp</span>
        </a>
      </div>
      <button type="button" className={`back-to-top ${showTop ? 'is-visible' : ''}`} onClick={backToTop} aria-label="Back to top" tabIndex={showTop ? 0 : -1} aria-hidden={!showTop}>
        <TempleIcon name="arrowUp" size={20} />
      </button>
    </>
  )
}
