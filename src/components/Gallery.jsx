import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { galleryCategories } from '../data/products'
import { normalizeMediaUrl } from '../lib/mediaUtils'
import ResponsiveImage from './ResponsiveImage'
import Lightbox from './Lightbox'
import TempleIcon from './TempleIcons'

const PAGE_SIZE = 12
const filterLabel = (filter) => (filter === 'Our Images' ? 'Designs' : filter)

function VideoLightbox({ items, index, onClose, onIndexChange }) {
  const dialogRef = useRef(null)
  const videoRef = useRef(null)
  const open = index !== null && index >= 0
  const item = open ? items[index] : null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open || !videoRef.current) return undefined
    const video = videoRef.current
    video.currentTime = 0
    video.play().catch(() => undefined)
    return () => {
      video.pause()
      video.currentTime = 0
    }
  }, [open, index])

  const step = useCallback((delta) => {
    if (!open || items.length < 2) return
    onIndexChange((index + delta + items.length) % items.length)
  }, [index, items.length, onIndexChange, open])

  useEffect(() => {
    if (!open) return undefined
    function onKey(event) {
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, open, step])

  return (
    <dialog ref={dialogRef} className="photo-lightbox video-lightbox" aria-label="Video viewer" onClose={onClose} onClick={(event) => { if (event.target === dialogRef.current) onClose() }}>
      {item ? (
        <div className="pl-inner">
          <div className="pl-toolbar">
            <span className="pl-count" aria-live="polite">{index + 1} / {items.length}</span>
            <button type="button" onClick={onClose} aria-label="Close video viewer" autoFocus><TempleIcon name="close" /></button>
          </div>
          <figure className="pl-figure">
            <div className="pl-stage pl-video-stage">
              <video ref={videoRef} key={item.id} controls autoPlay playsInline preload="metadata" aria-label={item.title}>
                <source src={normalizeMediaUrl(item.video)} type="video/mp4" />
                Your browser does not support this video.
              </video>
            </div>
            <figcaption>
              <strong>{item.title}</strong>
              <span>{item.audioAvailable ? 'Audio available' : 'No audio'}</span>
            </figcaption>
          </figure>
          {items.length > 1 ? (
            <>
              <button type="button" className="pl-nav pl-prev" onClick={() => step(-1)} aria-label="Previous video"><TempleIcon name="chevronLeft" size={28} /></button>
              <button type="button" className="pl-nav pl-next" onClick={() => step(1)} aria-label="Next video"><TempleIcon name="chevronRight" size={28} /></button>
            </>
          ) : null}
        </div>
      ) : null}
    </dialog>
  )
}

// Uniform card grid with category chips and "Load more". Photos open in a
// lightbox with swipe, zoom and captions; videos open in a full-size viewer.
export default function Gallery({ items = [], showFilters = true }) {
  const [activeFilter, setActiveFilter] = useState('All')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [videoIndex, setVideoIndex] = useState(null)

  const filters = useMemo(() => ['All', ...galleryCategories.filter((category) => items.some((item) => item.category === category))], [items])

  const filteredItems = useMemo(() => {
    if (activeFilter === 'All') return items
    return items.filter((item) => item.category.toLowerCase() === activeFilter.toLowerCase())
  }, [activeFilter, items])

  const photos = useMemo(() => filteredItems.filter((item) => !item.video), [filteredItems])
  const videos = useMemo(() => filteredItems.filter((item) => item.video), [filteredItems])
  const visibleItems = filteredItems.slice(0, visibleCount)
  const remaining = filteredItems.length - visibleItems.length

  function chooseFilter(filter) {
    setActiveFilter(filter)
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <div className="media-gallery">
      {showFilters ? (
        <div className="gallery-filters" role="group" aria-label="Gallery categories">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={filter === activeFilter ? 'active' : ''}
              aria-pressed={filter === activeFilter}
              onClick={() => chooseFilter(filter)}
            >
              {filterLabel(filter)}
            </button>
          ))}
        </div>
      ) : null}

      {filteredItems.length ? (
        <div className="gallery-cards">
          {visibleItems.map((item) => (
            <figure key={item.id} className="gallery-card">
              {item.video ? (
                <button type="button" className="gallery-card-open gallery-card-video" onClick={() => setVideoIndex(videos.indexOf(item))} aria-label={`Play full video: ${item.title}`}>
                  <video muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true">
                    <source src={`${normalizeMediaUrl(item.video)}#t=0.1`} type="video/mp4" />
                  </video>
                  <span className="gallery-video-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" focusable="false"><path d="M8 5v14l11-7z" /></svg></span>
                </button>
              ) : (
                <button type="button" className="gallery-card-open" onClick={() => setLightboxIndex(photos.indexOf(item))} aria-label={`Open larger view: ${item.title}`}>
                  <ResponsiveImage src={item.image} alt={item.alt} width={item.width} height={item.height} sizes="(max-width: 479px) 100vw, (max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw" />
                </button>
              )}
              <figcaption className="gallery-card-caption">{item.title}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="gallery-empty" role="status">No images or videos are available in this category.</p>
      )}

      {remaining > 0 ? (
        <div className="gallery-more">
          <button type="button" className="btn btn-secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Load more ({remaining})</button>
        </div>
      ) : null}

      <Lightbox items={photos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={setLightboxIndex} />
      <VideoLightbox items={videos} index={videoIndex} onClose={() => setVideoIndex(null)} onIndexChange={setVideoIndex} />
    </div>
  )
}
