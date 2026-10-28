import EnquiryForm from '../components/EnquiryForm'

export default function Contact() {
  return (
    <main className="page-shell">
      <section className="page-hero small-hero">
        <div className="container">
          <p className="eyebrow">Contact / Enquiry</p>
          <h1>Start your enquiry</h1>
        </div>
      </section>

      <section className="section-shell">
        <div className="container contact-layout">
          <div className="contact-details">
            <h2>Connect with Bharadwaj Mandir</h2>
            <ul>
              <li><strong>Phone:</strong> <a href="tel:+919953836555">+91-9953836555</a></li>
              <li><strong>Email:</strong> <a href="mailto:Bharadwajmandir@gmail.com">Bharadwajmandir@gmail.com</a></li>
            </ul>
          </div>
          <EnquiryForm />
        </div>
      </section>
    </main>
  )
}
