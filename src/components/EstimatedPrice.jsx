import { formatEstimatedPrice } from '../data/products'

export default function EstimatedPrice({ value }) {
  if (!value) return null
  return <p className="price-from">{formatEstimatedPrice(value)} <small>est.</small></p>
}
