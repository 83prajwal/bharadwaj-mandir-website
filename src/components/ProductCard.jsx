import { Link } from 'react-router-dom'

export default function ProductCard({ product, index = 0 }) {
  return (
    <article className="product-card">
      <Link to={`/products/${product.id}`} className="product-image-box" aria-label={`View ${product.name}`}>
        <img className="product-photo" src={product.image} alt={product.imageAlt} width={product.imageWidth} height={product.imageHeight} loading="lazy" decoding="async" />
      </Link>
      <div className="product-card-body">
        <p className="product-card-index" aria-hidden="true">Design {String(index + 1).padStart(2, '0')}</p>
        <p className="product-category">{product.category}</p>
        <h3><Link to={`/products/${product.id}`}>{product.name}</Link></h3>
        <p className="product-description">{product.shortDescription}</p>
        <div className="card-actions">
          <Link to={`/products/${product.id}`} className="text-link">View Details</Link>
          <Link to={`/contact?productId=${encodeURIComponent(product.id)}&productUrl=${encodeURIComponent(window.location.origin + `/products/${product.id}`)}`} className="text-link">Enquire</Link>
        </div>
      </div>
    </article>
  )
}
