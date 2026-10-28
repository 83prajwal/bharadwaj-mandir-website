import { Link } from 'react-router-dom'

export default function CTASection({ eyebrow = 'Bharadwaj Mandir', title, text, buttonLabel = 'Enquire Now', buttonLink = '/contact' }) {
  return (
    <section className="cta-band">
      <div className="container cta-inner">
        <div>
          <p className="eyebrow light">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <p>{text}</p>
        <Link to={buttonLink} className="btn btn-primary">{buttonLabel}</Link>
      </div>
    </section>
  )
}
