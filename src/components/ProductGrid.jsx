import ProductCard from './ProductCard'
import { estimatedPriceNote } from '../data/products'

export default function ProductGrid({ products }) {
  return (
    <>
      <div className="pcard-grid">
        {products.map((product, index) => (
          <ProductCard key={product.id} product={product} index={product.designNumber ?? index} />
        ))}
      </div>
      <p className="price-note">{estimatedPriceNote}</p>
    </>
  )
}
