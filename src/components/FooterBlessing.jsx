import { useEffect, useRef, useState } from 'react'
import { blessings } from '../data/siteContent'

const ROTATE_MS = 5000

// Rotates through blessings for different deities. It pauses while hovered or
// focused, while off screen, and after a visitor picks one. It never rotates
// for visitors who ask for reduced motion.
export default function FooterBlessing() {
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [visible, setVisible] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    const element = rootRef.current
    if (!element || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || chosen || hovered || !visible || blessings.length < 2) return undefined
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % blessings.length)
    }, ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [chosen, hovered, visible])

  const blessing = blessings[index]

  return (
    <div
      ref={rootRef}
      className="footer-blessing-rotator"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <p key={blessing.english} className="footer-blessing-text">
        <span lang="sa" className="blessing-devanagari">{blessing.devanagari}</span>
        <span className="blessing-english">{blessing.english}</span>
      </p>
      <div className="blessing-dots" role="group" aria-label="Choose a blessing">
        {blessings.map((item, i) => (
          <button
            key={item.english}
            type="button"
            aria-label={item.meaning}
            aria-pressed={i === index}
            onClick={() => { setIndex(i); setChosen(true) }}
          />
        ))}
      </div>
    </div>
  )
}
