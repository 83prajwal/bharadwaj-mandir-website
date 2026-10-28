import FAQSection from '../components/FAQSection'
import { faqItems, additionalFaqItems } from '../data/products'

export default function FAQ() {
  return (
    <main className="page-shell">
      <section className="page-hero small-hero">
        <div className="container">
          <p className="eyebrow">FAQ</p>
          <h1>Frequently asked questions</h1>
        </div>
      </section>

      <FAQSection items={[...faqItems, ...additionalFaqItems]} />
    </main>
  )
}
