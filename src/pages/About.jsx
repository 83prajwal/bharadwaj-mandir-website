import { Link } from 'react-router-dom'

const guidingPrinciples = [
  {
    number: '01',
    title: 'Thoughtful Design',
    description: 'Explore mandir designs with an appreciation for traditional inspiration, visual detail, and the character of marble.',
  },
  {
    number: '02',
    title: 'Your Space, Your Requirements',
    description: 'Every setting is different. Share your intended space and preferences so the appropriate design and requirements can be discussed.',
  },
  {
    number: '03',
    title: 'Clear Communication',
    description: 'We aim to make product enquiries straightforward, with details such as dimensions, finishes, pricing, and availability confirmed individually where necessary.',
  },
]

export default function About() {
  return (
    <main className="page-shell about-page">
      <section className="page-hero about-story-hero">
        <div className="container">
          <p className="eyebrow">Our Story</p>
          <h1>A dedicated space for moments that matter.</h1>
          <div className="about-story-intro">
            <p>At Bharadwaj Mandir, we believe a mandir should feel thoughtfully connected to its surroundings. Our focus is on marble mandir designs that bring together traditional inspiration, considered details, and the needs of the space they are created for.</p>
            <p>Whether you are planning a prayer space at home, in a workplace, at an institution, or in another dedicated setting, we invite you to explore our designs and share your requirements with us.</p>
          </div>
        </div>
      </section>

      <section className="section-shell about-purpose-section">
        <div className="container about-purpose-layout">
          <div>
            <p className="eyebrow">Our Purpose</p>
            <h2>Designed around your space and your needs.</h2>
          </div>
          <div className="about-purpose-copy">
            <p>Every prayer space has its own setting, proportions, and preferences. Our approach begins with understanding what matters to you, helping you explore suitable designs, and discussing the details required for your enquiry.</p>
            <p>The aim is to make the process of exploring a marble mandir clear, thoughtful, and personal.</p>
          </div>
        </div>
      </section>

      <section className="section-shell about-design-section">
        <div className="container about-editorial about-design-layout">
          <div className="about-editorial-copy">
            <p className="eyebrow">Our Design Philosophy</p>
            <h2>Tradition, detail, and thoughtful design.</h2>
            <p>Marble offers a distinctive canvas for traditional forms, intricate details, and elegant presentation. We focus on showcasing mandir designs in a way that helps customers appreciate their visual character and consider how a design may suit their intended space.</p>
            <p>Where dimensions, material, finish, or customization requirements need confirmation, these details should be discussed individually rather than assumed.</p>
          </div>
          <figure className="about-editorial-image">
            <img src="/assets/workshop/carved-detail-in-progress.webp" alt="A craftsperson carving a decorative pattern into a marble panel" width="675" height="900" loading="lazy" decoding="async" />
            <figcaption>Carved detail in progress</figcaption>
          </figure>
        </div>
      </section>

      <section className="section-shell about-values-section">
        <div className="container">
          <div className="about-values-heading">
            <p className="eyebrow">What Guides Us</p>
            <h2>A considered approach at every step.</h2>
          </div>
          <div className="about-values-grid">
            {guidingPrinciples.map((principle) => (
              <article className="about-value-card" key={principle.number}>
                <span className="about-value-number" aria-hidden="true">{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="about-audience-section">
        <div className="container about-audience-inner">
          <div className="about-audience-copy">
            <p className="eyebrow">Who We Serve</p>
            <h2>For homes and beyond.</h2>
            <p>A dedicated prayer space can take many forms. Explore our marble mandir designs for residential spaces, workplaces, institutions, and other settings where a thoughtfully planned prayer area is desired.</p>
          </div>
        </div>
      </section>

      <section className="about-invitation-section">
        <div className="container about-invitation-inner">
          <p className="eyebrow light">A Personal Starting Point</p>
          <h2>Let's explore the right design for your space.</h2>
          <p>Browse our collection to discover the available designs, or tell us about your setting and requirements through a custom enquiry.</p>
          <div className="about-invitation-actions">
            <Link to="/products" className="btn btn-primary">Explore Designs</Link>
            <Link to="/custom-mandir" className="btn btn-secondary">Request a Custom Quote</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
