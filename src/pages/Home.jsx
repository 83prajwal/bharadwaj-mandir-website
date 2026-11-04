import { Link } from 'react-router-dom'
import Hero from '../components/Hero'
import ProductGrid from '../components/ProductGrid'
import CTASection from '../components/CTASection'
import SectionHeading from '../components/SectionHeading'
import { products } from '../data/products'

// The home page stays short: hero, featured designs, how custom work begins,
// and one call to action. Gallery, story, FAQ and the enquiry form live on
// their own pages in the main menu.
const projectSteps = [
  'Share your requirements and references',
  'Provide available measurements',
  'Submit the enquiry for review',
  'Discuss specifications and quotation',
]

export default function Home() {
  return (
    <main className="home-page temple-home">
      <Hero />

      <section id="collection" className="home-section home-collection">
        <div className="container">
          <div className="section-heading-row">
            <SectionHeading eyebrow="The collection" title={<>A study in <span className="text-gradient">marble</span></>} text="A considered selection of mandir designs. Enquire for confirmed materials, dimensions and project details." />
            <Link to="/products" className="text-link section-side-link">View all designs <span aria-hidden="true">→</span></Link>
          </div>
          <ProductGrid products={products} />
        </div>
      </section>

      <section className="home-section home-custom">
        <div className="container home-custom-inner">
          <div>
            <p className="eyebrow">Made around your space</p>
            <h2>A mandir for your <span className="text-gradient">dedicated space.</span></h2>
            <p className="home-custom-text">Share your setting, measurements and references. The team reviews a design for your space and confirms specifications and quotation with you.</p>
            <div className="home-custom-actions">
              <Link to="/custom-mandir" className="btn btn-primary">Request a custom quote <span aria-hidden="true">→</span></Link>
              <Link to="/mandir-designer" className="btn btn-secondary">Try the 3D Studio</Link>
            </div>
          </div>
          <ol className="home-steps">
            {projectSteps.map((step, index) => (
              <li key={step}><span>{String(index + 1).padStart(2, '0')}</span>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <CTASection
        eyebrow="Begin with an enquiry"
        title="Your space. Your sensibility."
        text="Explore the current designs or tell us what you have in mind. The team can confirm project details and feasibility with you."
        buttonLabel="Start a conversation"
        buttonLink="/contact"
      />
    </main>
  )
}
