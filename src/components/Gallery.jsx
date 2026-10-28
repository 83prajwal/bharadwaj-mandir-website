import { useMemo, useState } from 'react'
import { galleryCategories } from '../data/products'

export default function Gallery({ items = [] }) {
  const [activeFilter, setActiveFilter] = useState('All')
  const filteredItems = useMemo(() => {
    if (activeFilter === 'All') return items
    return items.filter((item) => item.category.toLowerCase() === activeFilter.toLowerCase())
  }, [activeFilter, items])

  return (
    <div className="media-gallery">
      <div className="gallery-filters" aria-label="Gallery categories">
        {['All', ...galleryCategories].map((filter) => (
          <button
            key={filter}
            type="button"
            className={filter === activeFilter ? 'active' : ''}
            aria-pressed={filter === activeFilter}
            onClick={() => setActiveFilter(filter)}
          >
            {filter === 'Our Images' ? 'Designs' : filter}
          </button>
        ))}
      </div>

      {['All', 'Design Concepts', 'Reference images'].includes(activeFilter) ? (
        <p className="gallery-image-disclosure" role="note">
          Design concepts are AI-generated visualisations for inspiration, and reference boards may show illustrative designs. Neither confirms a completed product. Please enquire to confirm design details, materials, dimensions, finish and availability.
        </p>
      ) : null}

      {filteredItems.length ? (
        <div className="gallery-grid video-gallery-grid">
          {filteredItems.map((item) => item.video ? (
            <article key={item.id} className="gallery-item gallery-item-video">
              <video controls playsInline preload="metadata" aria-label={item.title}>
                <source src={item.video} type="video/mp4" />
                Your browser does not support this video.
              </video>
              <div className="gallery-caption"><span>{item.title}</span><small className="video-audio-label">{item.audioAvailable ? 'Audio available' : 'No audio'}</small></div>
            </article>
          ) : (
            <figure key={item.id} className="gallery-item gallery-item-photo">
              <img src={item.image} alt={item.alt} width={item.width} height={item.height} loading="lazy" decoding="async" />
              <figcaption className="gallery-caption">
                <span>{item.title}</span>
                {item.detail ? <small className="gallery-caption-detail">{item.detail}</small> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="gallery-empty" role="status">No images or videos are available in this category.</p>
      )}
    </div>
  )
}
