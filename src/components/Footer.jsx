import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Link to="/" className="brand brand-footer"><span className="brand-mark"><span className="brand-name">Bharadwaj</span><span className="brand-subtitle">Mandir</span></span></Link>
          <p className="footer-copy">
            Marble mandir designs and devotional spaces, presented with care for material, form and detail.
          </p>
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
            <li><Link to="/international-delivery">International enquiries</Link></li>
            <li><Link to="/privacy">Privacy notice</Link></li>
            <li><Link to="/terms">Website terms</Link></li>
          </ul>
        </div>

        <div>
          <h3>Contact</h3>
          <p className="footer-meta"><a href="tel:+919953836555">+91-9953836555</a></p>
          <p className="footer-meta"><a href="mailto:Bharadwajmandir@gmail.com">Bharadwajmandir@gmail.com</a></p>
          <Link to="/contact" className="text-link footer-contact-link">Send an enquiry</Link>
        </div>
      </div>
    </footer>
  )
}
