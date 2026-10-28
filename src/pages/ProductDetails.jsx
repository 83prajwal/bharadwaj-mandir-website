import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { products } from '../data/products'

export default function ProductDetails() {
  const { id } = useParams()
  const product = useMemo(() => products.find((item) => item.id === id), [id])
  if (!product) {
    return <main className="page-shell"><section className="section-shell container"><p className="eyebrow">Product not found</p><h1>This product is unavailable.</h1><Link to="/products" className="btn btn-primary">Browse Products</Link></section></main>
  }

  const specifications = [
    ['Material', product.material],
    ['Finish', product.finish],
    ['Dimensions', product.dimensions],
    ['Availability', product.availability],
  ].filter(([, value]) => value)

  return (
    <main className="page-shell">
      <section className="page-hero small-hero product-page-hero">
        <div className="container">
          <Link to="/products" className="back-link">← The collection</Link>
          <p className="eyebrow">The collection</p>
          <h1>{product.name}</h1>
        </div>
      </section>

      <section className="section-shell">
        <div className="container product-detail-layout">
          <figure className="product-detail-gallery product-detail-images">
            <img src={product.image} alt={product.imageAlt} width={product.imageWidth} height={product.imageHeight} fetchPriority="high" decoding="async" />
            <figcaption>{product.name} — design shown in the supplied reference image.</figcaption>
          </figure>
          <div className="product-detail-copy">
            <p className="product-category">{product.category}</p>
            <p>{product.description}</p>
            <p className="quote-note">Share your space requirements and preferred design details through a custom enquiry. Product dimensions, material, finish and available customization can be confirmed individually.</p>
            {specifications.length > 0 ? (
              <ul className="detail-list">
                {specifications.map(([label, value]) => <li key={label}><strong>{label}:</strong> {value}</li>)}
              </ul>
            ) : null}
            <p className="quote-note">Pricing and availability are confirmed for each enquiry.</p>
            {product.features?.length ? (
              <ul className="detail-list" aria-label="Features">
                {product.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            ) : null}
            <div className="button-row">
              <Link to={`/contact?productId=${encodeURIComponent(product.id)}&productUrl=${encodeURIComponent(window.location.origin + window.location.pathname)}`} className="btn btn-primary">Enquire About This Mandir</Link>
              <Link to="/products" className="btn btn-secondary">Back to Products</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
