import { Link } from 'react-router-dom'
import { deliveryPolicyFacts } from '../data/products'

export default function InternationalDelivery() {
  return <main className="page-shell">
    <section className="page-hero small-hero"><div className="container"><p className="eyebrow">International delivery</p><h1>Tell us your destination and we will confirm feasibility.</h1></div></section>
    <section className="section-shell"><div className="container legal-copy">
      <p>{deliveryPolicyFacts[0]}</p>
      <h2>How an enquiry may proceed</h2>
      <ol><li>Share your destination, space and design brief.</li><li>Discuss design and confirm project specifications.</li><li>Receive a project quotation after scope and delivery feasibility are reviewed.</li><li>If accepted, confirm production, packing and freight arrangements before work begins.</li><li>Confirm customs, local delivery, unloading and any installation responsibilities for the destination.</li></ol>
      <h2>Items to confirm in a project quotation</h2>
      <p>{deliveryPolicyFacts[1]}</p>
      <p>{deliveryPolicyFacts[2]}</p>
      <Link to="/contact" className="btn btn-primary">Share your destination and request a quote</Link>
    </div></section>
  </main>
}
