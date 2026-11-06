import { useEffect, useState } from 'react'
import TempleIcon from './TempleIcons'

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
        // Keep the assistant widget out of the home hero until its actions are visible.
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

  return <button type="button" className={`back-to-top ${showTop ? 'is-visible' : ''}`} onClick={backToTop} aria-label="Back to top" tabIndex={showTop ? 0 : -1} aria-hidden={!showTop}>
    <TempleIcon name="arrowUp" size={20} />
  </button>
}
