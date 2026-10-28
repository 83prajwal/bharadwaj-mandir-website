import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { navLinks } from '../data/products'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef(null)

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

  return (
    <header className="site-header">
      <nav className="navbar container" aria-label="Main navigation">
        <Link to="/" className="brand" aria-label="Bharadwaj Mandir home">
          <span className="brand-mark"><span className="brand-name">Bharadwaj</span><span className="brand-subtitle">Mandir</span></span>
        </Link>

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

        <div id="primary-navigation" className={`nav-panel ${menuOpen ? 'open' : ''}`}>
          <ul className="nav-links">
            {navLinks.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <Link to="/contact" className="btn btn-primary nav-cta" onClick={() => setMenuOpen(false)}>
            Request a Quote
          </Link>
        </div>
      </nav>
    </header>
  )
}
