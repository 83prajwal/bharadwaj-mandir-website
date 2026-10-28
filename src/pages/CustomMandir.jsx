import { Link } from 'react-router-dom'
import { designReferences } from '../data/products'

const projectSteps = [
  ['01', 'Share your brief', 'Tell us what you have in mind and include any design references.'],
  ['02', 'Add your measurements', 'Share the available dimensions and any space or access considerations.'],
  ['03', 'Send your enquiry', 'The details you provide give the team context to review your request.'],
  ['04', 'Discuss the specifics', 'Specifications, options and quotation can be confirmed for your project.'],
]

export default function CustomMandir() {
  return (
    <main className="page-shell custom-page">
      <section className="custom-page-hero custom-page-hero-with-image">
        <div className="custom-page-copy">
          <p className="eyebrow">A more personal design</p>
          <h1>Begin with<br className="custom-hero-break" /> the space you have.</h1>
          <p>Share the dimensions, references and details that will help frame your custom mandir enquiry. The team can review what may suit your project.</p>
          <Link to="/contact?interest=Custom%20mandir" className="btn btn-primary">Share your project <span aria-hidden="true">→</span></Link>
        </div>
        <figure className="custom-page-image">
          <img
            src="/assets/gallery/20260514-wa0021.jpg"
            alt="Bharadwaj Mandir design board with a white shrine rendering, front and side elevations, a plan view, elephant details and specifications"
            width="1402"
            height="1122"
            fetchPriority="high"
            decoding="async"
          />
        </figure>
      </section>

      <section className="section-shell custom-journey-section">
        <div className="container">
          <div className="section-heading-row">
            <div><p className="eyebrow">A simple starting point</p><h2>What to include in your enquiry</h2></div>
            <p className="section-text">A few practical details can help the team understand your request. You can share what you know and ask questions about the rest.</p>
          </div>
          <ol className="custom-journey-grid">
            {projectSteps.map(([number, title, text]) => (
              <li key={number}><span className="journey-number">{number}</span><h3>{title}</h3><p>{text}</p></li>
            ))}
          </ol>
          <div className="button-row"><Link to="/contact?interest=Custom%20mandir" className="btn btn-primary">Continue to the enquiry form</Link></div>
        </div>
      </section>

      {designReferences.map((reference) => (
        <section key={reference.id} className="section-shell reference-section">
          <div className="container reference-editorial reference-editorial-text-only">
            <div className="reference-copy">
              <p className="eyebrow">Text record from the design archive</p>
              <h2>{reference.name}</h2>
              <p>These details were transcribed from a supplied drawing and are included as text only. Confirm the original drawing and project specifications with the team before relying on them.</p>
              <ul className="detail-list">
                <li><strong>Material shown:</strong> {reference.material}</li>
                <li><strong>Finish shown:</strong> {reference.finish}</li>
                <li><strong>Dimensions shown:</strong> {reference.dimensions}</li>
                {reference.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <Link to="/contact?interest=Custom%20mandir" className="text-link">Ask about a custom design <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>
      ))}
    </main>
  )
}
