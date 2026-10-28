import Gallery from '../components/Gallery'
import { galleryImages } from '../data/products'

export default function GalleryPage() {
  return (
    <main className="page-shell gallery-page">
      <section className="page-hero small-hero">
        <div className="container">
          <p className="eyebrow">Our Images</p>
          <h1>Mandir designs and craftsmanship.</h1>
          <p className="page-intro-copy">Browse mandir designs, product photography, and workshop videos.</p>
        </div>
      </section>

      <section className="section-shell gallery-page-section">
        <div className="container">
          <Gallery items={galleryImages} />
        </div>
      </section>
    </main>
  )
}
