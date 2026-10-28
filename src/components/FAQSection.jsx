export default function FAQSection({ items }) {
  return (
    <section className="faq-section">
      <div className="container faq-grid">
        <div>
          <p className="eyebrow">Frequently Asked Questions</p>
          <h2>Helpful guidance for your project</h2>
        </div>
        <div className="faq-list">
          {items.map((item) => (
            <details key={item.question} className="faq-item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
