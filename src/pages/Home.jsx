import { Link } from 'react-router-dom'
import Hero from '../components/Hero'
import ProductGrid from '../components/ProductGrid'
import CTASection from '../components/CTASection'
import SectionHeading from '../components/SectionHeading'
import FAQSection from '../components/FAQSection'
import { products, galleryImages, faqItems } from '../data/products'

const projectSteps = [
  'Share your requirements and references',
  'Provide available measurements',
  'Submit the enquiry for review',
  'Discuss specifications and quotation',
]

const processVideos = galleryImages.filter((item) => item.video).slice(0, 3)

export default function Home() {
  return (
    <main className="home-page">
      <Hero />

      <section className="collection-section section-shell">
        <div className="container">
          <div className="section-heading-row">
            <SectionHeading eyebrow="The collection · 01—04" title="A study in marble" text="A considered selection of mandir designs. Enquire for confirmed materials, dimensions and project details." />
            <Link to="/products" className="text-link section-side-link">View all designs <span aria-hidden="true">→</span></Link>
          </div>
          <ProductGrid products={products} />
        </div>
      </section>

      <section className="custom-feature custom-feature-text-only">
        <div className="custom-feature-copy">
          <p className="eyebrow">Made around your space</p>
          <h2>A mandir for your dedicated space.</h2>
          <p>Every space has its own proportions and point of view. Share your setting, measurements, references and preferences so the team can review a design for your enquiry.</p>
          <ol className="project-steps">
            {projectSteps.map((step, index) => <li key={step}><span>0{index + 1}</span>{step}</li>)}
          </ol>
          <Link to="/custom-mandir" className="btn btn-primary">Explore custom enquiries <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className="craft-section section-shell">
        <div className="container">
          <div className="section-heading-row craft-heading-row">
            <SectionHeading eyebrow="The making · 02" title="Process in motion" text="A selection of workshop videos, with audio where available." />
            <Link to="/gallery" className="text-link section-side-link">View workshop videos <span aria-hidden="true">→</span></Link>
          </div>
          <div className="process-video-list">
            {processVideos.map((item, index) => (
              <article className="process-video-item" key={item.id}>
                <span>Video {String(index + 1).padStart(2, '0')}</span>
                <video controls playsInline preload="metadata" aria-label={item.title}><source src={item.video} type="video/mp4" />Your browser does not support this video.</video>
                <h3>{item.title}</h3>
                <small>{item.audioAvailable ? 'Audio available' : 'No audio'}</small>

              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="story-band">
        <div className="container story-band-inner">
          <p className="eyebrow light">Bharadwaj Mandir · 03</p>
          <h2>A dedicated space for the things that matter most.</h2>
          <div className="story-band-bottom">
            <p>We present marble mandir designs and custom devotional spaces for homes, workplaces, institutions and other settings. Project specifications are confirmed individually.</p>
            <Link to="/about" className="story-link">A little about us <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <CTASection
        eyebrow="Begin with an enquiry"
        title="Your space. Your sensibility."
        text="Explore the current designs or tell us what you have in mind. The team can confirm project details and feasibility with you."
        buttonLabel="Start a conversation"
        buttonLink="/contact"
      />

      <FAQSection items={faqItems} />
    </main>
  )
}
