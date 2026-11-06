import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { navLinks } from '../data/products'
import BellToggle from './BellToggle'
import WhatsAppLink from './WhatsAppLink'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef(null)
  const { pathname } = useLocation()
  const isHome = pathname === '/'

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  // The home hero sits under a transparent header that turns solid on scroll.
  useEffect(() => {
    const root = document.documentElement
    if (isHome) root.setAttribute('data-home', '')
    else root.removeAttribute('data-home')
    return () => root.removeAttribute('data-home')
  }, [isHome])

  useEffect(() => {
    document.documentElement.toggleAttribute('data-menu-open', menuOpen)
  }, [menuOpen])

  return (
    <header className="site-header">
      <nav className="navbar container" aria-label="Main navigation">
        <Link to="/" className="brand" aria-label="Bharadwaj Mandir home">
          <span className="brand-emblem" aria-hidden="true">ॐ</span>
          <span className="brand-mark"><span className="brand-name">Bharadwaj</span><span className="brand-subtitle">Mandir</span></span>
        </Link>

        <div className="navbar-tools">
          <BellToggle />
          <button
            ref={menuButton}
            type="button"
            className="menu-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <div id="primary-navigation" className={`nav-panel ${menuOpen ? 'open' : ''}`}>
          <ul className="nav-links">
            {navLinks.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <WhatsAppLink className="nav-whatsapp" label="Chat with Bharadwaj Mandir on WhatsApp" iconSize={20} onClick={() => setMenuOpen(false)}><span>WhatsApp</span></WhatsAppLink>

          <Link to="/contact" className="btn btn-primary nav-cta" onClick={() => setMenuOpen(false)}>
            Request a Quote
          </Link>
        </div>
      </nav>
    </header>
  )
}
