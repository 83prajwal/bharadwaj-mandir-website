import { useCallback, useEffect, useRef, useState } from 'react'
import TempleIcon from './TempleIcons'
import { getImageSources } from '../lib/responsiveImage'

// Accessible photo viewer built on <dialog>: keyboard arrows, Escape,
// swipe left/right, tap/double-click or buttons to zoom, and captions.
export default function Lightbox({ items, index, onClose, onIndexChange }) {
  const dialogRef = useRef(null)
  const touchStart = useRef(null)
  // Zoom belongs to one photo; moving to another photo resets it automatically.
  const [zoomState, setZoomState] = useState({ index: null, origin: null })
  const zoom = zoomState.index === index ? zoomState.origin : null // null = fit, else {x, y} in %
  const setZoom = (origin) => setZoomState({ index, origin })
  const open = index !== null && index >= 0
  const item = open ? items[index] : null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const step = useCallback((delta) => {
    if (!open || items.length < 2) return
    onIndexChange((index + delta + items.length) % items.length)
  }, [open, items.length, index, onIndexChange])

  useEffect(() => {
    if (!open) return undefined
    function onKey(event) {
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step])

  function toggleZoom(event) {
    if (zoom) { setZoom(null); return }
    const rect = event?.currentTarget?.getBoundingClientRect?.()
    if (rect && event.clientX) setZoom({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 })
    else setZoom({ x: 50, y: 50 })
  }

  function onTouchStart(event) {
    if (event.touches.length !== 1) return
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
  }

  function onTouchEnd(event) {
    const start = touchStart.current
    touchStart.current = null
    if (!start || zoom) return
    const dx = event.changedTouches[0].clientX - start.x
    const dy = event.changedTouches[0].clientY - start.y
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1)
  }

  const image = item ? getImageSources(item.image || item.src) : null

  return (
    <dialog ref={dialogRef} className="photo-lightbox" aria-label="Photo viewer" onClose={onClose} onClick={(event) => { if (event.target === dialogRef.current) onClose() }}>
      {item ? (
        <div className="pl-inner">
          <div className="pl-toolbar">
            <span className="pl-count" aria-live="polite">{index + 1} / {items.length}</span>
            <button type="button" onClick={() => toggleZoom()} aria-label={zoom ? 'Zoom out' : 'Zoom in'}><TempleIcon name={zoom ? 'zoomOut' : 'zoomIn'} /></button>
            <button type="button" onClick={onClose} aria-label="Close photo viewer" autoFocus><TempleIcon name="close" /></button>
          </div>
          <figure className="pl-figure" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className={`pl-stage ${zoom ? 'is-zoomed' : ''}`} onDoubleClick={toggleZoom} onClick={(event) => { if (zoom) toggleZoom(event) }}>
              <img
                key={image.src}
                src={image.src}
                srcSet={image.srcSet}
                sizes="(max-width: 900px) 100vw, 80vw"
                alt={item.alt}
                style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
              />
            </div>
            <figcaption>
              <strong>{item.title || item.caption}</strong>
              {item.detail ? <span>{item.detail}</span> : null}
            </figcaption>
          </figure>
          {items.length > 1 ? (
            <>
              <button type="button" className="pl-nav pl-prev" onClick={() => step(-1)} aria-label="Previous photo"><TempleIcon name="chevronLeft" size={28} /></button>
              <button type="button" className="pl-nav pl-next" onClick={() => step(1)} aria-label="Next photo"><TempleIcon name="chevronRight" size={28} /></button>
            </>
          ) : null}
        </div>
      ) : null}
    </dialog>
  )
}
