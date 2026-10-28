import { Link } from 'react-router-dom'

export default function Hero({
  title = 'Marble mandirs, made personal.',
  text = 'Thoughtfully designed marble mandirs for homes, workplaces, institutions and other dedicated spaces. Share your setting and requirements for a custom enquiry.',
}) {
  return (
    <section className="hero-section">
      <div className="hero-inner hero-inner-photo">
        <div className="hero-copy">
          <p className="eyebrow">Bharadwaj Mandir <span className="eyebrow-rule" /></p>
          <h1>{title === 'Marble mandirs, made personal.' ? <><span>Marble mandirs,</span><span>made personal.</span></> : title}</h1>
          <p className="hero-text">{text}</p>
          <div className="button-row">
            <Link to="/products" className="btn btn-primary">Explore designs <span aria-hidden="true">→</span></Link>
            <Link to="/custom-mandir" className="hero-text-link">Request a custom quote <span aria-hidden="true">→</span></Link>
          </div>
          <p className="hero-signature">Designs to make space for what matters.</p>
        </div>
        <figure className="hero-editorial-panel hero-photo-panel">
          <img
            src="/assets/ai-concepts/mandir-concept-44.jpg"
            alt="AI-generated design concept of a white domed mandir with carved pillars, a red patterned backdrop and devotional figures"
            width="1024"
            height="1024"
            fetchPriority="high"
            decoding="async"
          />
        </figure>
      </div>
    </section>
  )
}
