import { Link } from 'react-router-dom'
import TempleIcon from './TempleIcons'
import { Divider } from './Ornaments'
import WhatsAppLink from './WhatsAppLink'
import { blessingLine, socialLinks, visitInfo } from '../data/siteContent'
import { openAssistantEvent, openCookieSettingsEvent } from '../lib/siteEvents'

export default function Footer() {
  return (
    <footer className="site-footer">
      <Divider variant="gopuram" className="footer-gopuram" />
      <div className="container footer-grid">
        <div>
          <Link to="/" className="brand brand-footer"><span className="brand-emblem" aria-hidden="true">ॐ</span><span className="brand-mark"><span className="brand-name">Bharadwaj</span><span className="brand-subtitle">Mandir</span></span></Link>
          <p className="footer-copy">
            Marble mandir designs and devotional spaces, presented with care for material, form and detail.
          </p>
          <ul className="footer-social" aria-label="Social media">
            {socialLinks.items.map((item) => (
              <li key={item.id}>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`${item.label} (opens in a new tab)`}><TempleIcon name={item.id} size={20} /></a>
                ) : (
                  <span className="footer-social-pending" title={`${item.label} link coming soon`}><TempleIcon name={item.id} size={20} /><span className="visually-hidden">{item.label} link coming soon</span></span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3>Quick Links</h3>
          <ul className="footer-links">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/products">Products</Link></li>
            <li><Link to="/custom-mandir">Custom Mandir</Link></li>
            <li><Link to="/gallery">Gallery</Link></li>
            <li><Link to="/about">About</Link></li>
            <li><Link to="/contact">Contact</Link></li>
            <li><Link to="/international-delivery">International delivery</Link></li>
            <li><Link to="/privacy">Privacy</Link></li>
            <li><Link to="/terms">Terms</Link></li>
          </ul>
        </div>

        <div>
          <h3>Explore</h3>
          <ul className="footer-links">
            <li><Link to="/faq">Frequently asked questions</Link></li>
            <li><Link to="/mandir-designer">3D Studio</Link></li>
            <li><Link to="/international-delivery">International enquiries</Link></li>
            <li><Link to="/privacy">Privacy notice</Link></li>
            <li><Link to="/terms">Website terms</Link></li>
            <li><button type="button" className="footer-link-button" onClick={() => window.dispatchEvent(new Event(openAssistantEvent))}>Ask our assistant</button></li>
            <li><button type="button" className="footer-link-button" onClick={() => window.dispatchEvent(new Event(openCookieSettingsEvent))}>Cookie settings</button></li>
          </ul>
        </div>

        <div>
          <h3>Contact</h3>
          <address className="footer-address">
            {visitInfo.addressLines.map((line) => <span key={line}>{line}</span>)}
            {!visitInfo.confirmed ? <small className="footer-sample">(sample address)</small> : null}
          </address>
          <p className="footer-meta"><a href="tel:+919953836555">+91-9953836555</a></p>
          <p className="footer-meta"><WhatsAppLink className="footer-whatsapp" label="Chat with Bharadwaj Mandir on WhatsApp" iconSize={18}><span>WhatsApp</span></WhatsAppLink></p>
          <p className="footer-meta"><a href="mailto:Bharadwajmandir@gmail.com">Bharadwajmandir@gmail.com</a></p>
          <Link to="/contact" className="text-link footer-contact-link">Send an enquiry</Link>
        </div>
      </div>
      <div className="footer-blessing container">
        <Divider variant="lotus" />
        <p><span lang="sa" className="blessing-devanagari">{blessingLine.devanagari}</span> <span className="blessing-english">{blessingLine.english}</span></p>
        <small>© {new Date().getFullYear()} Bharadwaj Mandir</small>
      </div>
    </footer>
  )
}
