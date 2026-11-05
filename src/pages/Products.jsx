import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ProductGrid from '../components/ProductGrid'
import SectionHeading from '../components/SectionHeading'
import { products } from '../data/products'

// Numbers stay with each design, so "Design 01" does not change when sorted.
const catalogue = products.map((product, index) => ({ ...product, designNumber: index }))

export default function Products() {
  const [sort, setSort] = useState('featured')
  const sortedProducts = useMemo(() => {
    if (sort === 'featured') return catalogue
    const direction = sort === 'price-low' ? 1 : -1
    return [...catalogue].sort((a, b) => (a.estimatedPriceUsd - b.estimatedPriceUsd) * direction)
  }, [sort])

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
          {products.length ? (
            <>
              <label className="sort-control">
                <span>Sort by</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="featured">Featured</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                </select>
              </label>
              <ProductGrid products={sortedProducts} />
            </>
          ) : <p role="status">There are no designs to show right now.</p>}
        </div>
      </section>

      <section className="collection-bottom-cta"><div className="container"><p className="eyebrow light">Have a particular space in mind?</p><h2>Explore a custom enquiry.</h2><Link to="/custom-mandir" className="btn btn-secondary">Custom mandir <span aria-hidden="true">↗</span></Link></div></section>
    </main>
  )
}
