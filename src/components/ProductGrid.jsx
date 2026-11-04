import ProductCard from './ProductCard'

export default function ProductGrid({ products }) {
  return (
    <div className="pcard-grid">
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} index={index} />
      ))}
    </div>
  )
}
