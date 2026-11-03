import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/*
  Adds scroll-reveal, header and progress behaviour to the existing pages
  without editing each page. It only sets data-* attributes, which React
  never overwrites, and it never hides anything until the browser confirms
  the element is below the fold. With JavaScript off, or with reduced motion
  on, every element simply stays visible.
*/

// [selector, variant, stagger the siblings?]
const REVEALS = [
  ['.page-hero .eyebrow, .page-hero h1, .page-hero p', 'up', true],
  ['.section-heading', 'up', false],
  ['.section-heading-row .section-side-link', 'up', false],
  ['.product-card', 'up', true],
  ['.project-steps li', 'left', true],
  ['.custom-feature-copy > .eyebrow, .custom-feature-copy > h2, .custom-feature-copy > p, .custom-feature-copy > .btn', 'up', true],
  ['.process-video-item', 'up', true],
  ['.story-band .eyebrow, .story-band h2, .story-band-bottom', 'up', true],
  ['.cta-inner > *', 'up', true],
  ['.faq-grid > *', 'up', true],
  ['.faq-item', 'up', true],
  ['.craft-mosaic-item', 'up', true],
  ['.gallery-item', 'up', true],
  ['.product-detail-gallery, .product-detail-copy', 'up', true],
  ['.contact-details, .enquiry-box', 'up', true],
  ['.about-editorial-image, .about-note-inner', 'up', true],
]

const MAX_STAGGER = 5

export default function MotionEffects() {
  const { pathname } = useLocation()
  const observerRef = useRef(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const root = document.documentElement
    const bar = document.querySelector('.scroll-progress span')

    // ---------- scroll state: header shrink, progress bar, hero glow drift ----------
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (y > 24) root.setAttribute('data-scrolled', '')
        else root.removeAttribute('data-scrolled')
        if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`
        if (!reduce) root.style.setProperty('--py', String(Math.min(y, 900)))
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    // ---------- reveal on scroll ----------
    let observer = null
    if (!reduce && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.setAttribute('data-in', '')
          observer.unobserve(entry.target)
        })
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
      observerRef.current = observer
    }

    function scan() {
      if (!observer) return
      const fold = window.innerHeight * 0.92
      REVEALS.forEach(([selector, variant, stagger]) => {
        const groups = new Map()
        document.querySelectorAll(`#main-content ${selector.split(',').join(', #main-content ')}`).forEach((el) => {
          if (el.hasAttribute('data-reveal')) {
            if (el.hasAttribute('data-in')) return
            if (el.getBoundingClientRect().top < fold) {
              el.setAttribute('data-in', '')
              observer.unobserve(el)
            } else {
              observer.observe(el)
            }
            return
          }
          el.setAttribute('data-reveal', variant)
          const parent = el.parentElement
          const index = groups.get(parent) || 0
          groups.set(parent, index + 1)
          if (stagger && index > 0) el.setAttribute('data-rd', String(Math.min(index, MAX_STAGGER)))
          if (el.getBoundingClientRect().top < fold) el.setAttribute('data-in', '')
          else observer.observe(el)
        })
      })
    }

    scan()
    // Pages render asynchronously and the gallery re-renders when filtered.
    let pending = 0
    const mutations = new MutationObserver(() => {
      cancelAnimationFrame(pending)
      pending = requestAnimationFrame(scan)
    })
    const target = document.getElementById('main-content')
    if (target) mutations.observe(target, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      mutations.disconnect()
      cancelAnimationFrame(pending)
      if (observer) observer.disconnect()
    }
  }, [pathname])

  return <div className="scroll-progress" aria-hidden="true"><span /></div>
}
