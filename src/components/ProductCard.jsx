import { Link } from 'react-router-dom'
import EstimatedPrice from './EstimatedPrice'
import WhatsAppLink from './WhatsAppLink'
import { designWhatsappMessage } from '../config/contact'
import ResponsiveImage from './ResponsiveImage'

export default function ProductCard({ product, index = 0 }) {
  const detailsUrl = `/products/${product.id}`
  const enquireUrl = `/contact?productId=${encodeURIComponent(product.id)}&productUrl=${encodeURIComponent(window.location.origin + detailsUrl)}`

  return (
    <article className="pcard">
      <Link to={detailsUrl} className="pcard-media" tabIndex={-1} aria-hidden="true">
        <ResponsiveImage src={product.image} alt={product.imageAlt} sizes="(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 25vw" />
        <span className="pcard-tag">{product.category}</span>
      </Link>
      <div className="pcard-body">
        <p className="pcard-index">Design {String(index + 1).padStart(2, '0')}</p>
        <h3 className="pcard-title"><Link to={detailsUrl}>{product.name}</Link></h3>
        <p className="pcard-text">{product.shortDescription}</p>
        <EstimatedPrice value={product.estimatedPriceUsd} />
        <div className="pcard-actions">
          <Link to={enquireUrl} className="btn btn-primary btn-small" aria-label={`Enquire about ${product.name}`}>Enquire</Link>
          <Link to={detailsUrl} className="pcard-link" aria-label={`View details of ${product.name}`}>View details <span aria-hidden="true">→</span></Link>
        </div>
        <WhatsAppLink className="btn btn-whatsapp btn-small" message={designWhatsappMessage(index, product.name)} label={`Enquire on WhatsApp about ${product.name}`} iconSize={18}><span>Enquire on WhatsApp</span></WhatsAppLink>
      </div>
    </article>
  )
}
