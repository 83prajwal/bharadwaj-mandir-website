import { Link } from 'react-router-dom'
import ProductGrid from '../components/ProductGrid'
import SectionHeading from '../components/SectionHeading'
import { products } from '../data/products'

export default function Products() {
  return (
    <main className="page-shell products-page">
      <section className="page-hero small-hero">
        <div className="container">
          <p className="eyebrow">Collection · 04 designs</p>
          <h1>The mandir collection</h1>
          <p className="page-intro-copy">A considered selection of marble mandir designs. Enquire to confirm the details for the piece that speaks to you.</p>
        </div>
      </section>

      <section className="section-shell">
        <div className="container">
          <SectionHeading eyebrow="Products" title="Marble mandir designs" text="Specifications, pricing and availability are confirmed individually. Contact the team to discuss a design." />
          {products.length ? <ProductGrid products={products} /> : <p role="status">There are no designs to show right now.</p>}
        </div>
      </section>

      <section className="collection-bottom-cta"><div className="container"><p className="eyebrow light">Have a particular space in mind?</p><h2>Explore a custom enquiry.</h2><Link to="/custom-mandir" className="btn btn-secondary">Custom mandir <span aria-hidden="true">↗</span></Link></div></section>
    </main>
  )
}
