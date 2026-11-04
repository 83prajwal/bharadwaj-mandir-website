import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ResponsiveImage from './ResponsiveImage'
import TempleIcon from './TempleIcons'
import { Diya, Mandala, Petals } from './Ornaments'
import { heroShloka } from '../data/siteContent'
import { heroSlides } from '../data/heroSlides'

const SLIDE_MS = 7000

export default function Hero() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (paused || heroSlides.length < 2) return undefined
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % heroSlides.length)
    }, SLIDE_MS)
    return () => window.clearInterval(timer)
  }, [paused])

  return (
    <section id="home" className="temple-hero" aria-label="Welcome to Bharadwaj Mandir">
      <div className="temple-hero-media">
        {heroSlides.map((slide, i) => (
          <div key={slide.src} className={`temple-hero-slide ${i === index ? 'is-active' : ''}`} aria-hidden={i !== index}>
            <ResponsiveImage src={slide.src} alt={slide.alt} sizes="100vw" priority={i === 0} style={{ objectPosition: slide.position || 'center' }} />
          </div>
        ))}
      </div>
      <div className="temple-hero-overlay" aria-hidden="true" />
      <Mandala className="temple-hero-mandala" />
      <Petals />

      <div className="temple-hero-content container">
        <p className="temple-hero-eyebrow">
          <TempleIcon name="bell" className="temple-hero-bell" size={22} />
          Marble mandirs, made personal
        </p>
        <h1 className="temple-hero-title">Bharadwaj Mandir</h1>
        <figure className="temple-hero-shloka">
          <blockquote>
            <p lang="sa">{heroShloka.devanagari}</p>
          </blockquote>
          <figcaption>
            <span className="shloka-translit">{heroShloka.transliteration}</span>
            <span className="shloka-meaning">{heroShloka.meaning}</span>
          </figcaption>
        </figure>
        <p className="temple-hero-text">Thoughtfully designed marble mandirs for homes, workplaces, institutions and other dedicated spaces. Share your setting and requirements for a custom enquiry.</p>
        <div className="temple-hero-actions">
          <Link to="/products" className="btn btn-primary"><TempleIcon name="temple" size={18} /> Explore designs</Link>
          <Link to="/custom-mandir" className="btn btn-ghost-light">Request a custom quote <span aria-hidden="true">→</span></Link>
        </div>
      </div>

      <div className="temple-hero-diyas" aria-hidden="true">
        <Diya /><Diya className="diya-mid" /><Diya />
      </div>

      {heroSlides.length > 1 ? (
        <div className="temple-hero-controls">
          <div className="temple-hero-dots" role="group" aria-label="Choose a hero photo">
            {heroSlides.map((slide, i) => (
              <button key={slide.src} type="button" aria-label={`Show photo ${i + 1}: ${slide.alt}`} aria-pressed={i === index} onClick={() => setIndex(i)} />
            ))}
          </div>
          <button type="button" className="temple-hero-pause" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play photo slideshow' : 'Pause photo slideshow'}>
            {paused ? '▶' : '❚❚'}
          </button>
        </div>
      ) : null}

    </section>
  )
}
