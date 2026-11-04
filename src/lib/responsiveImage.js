import manifest from '../data/imageManifest.json' with { type: 'json' }

// Looks up the WebP variants made by `npm run images:optimize`.
// Falls back to the original file when an image has not been optimised.
export function getImageSources(src) {
  const entry = manifest[src] || manifest[safeDecode(src)]
  if (!entry) return { src, srcSet: undefined, width: undefined, height: undefined }
  const largest = entry.widths.at(-1)
  return {
    src: `${entry.base}-${largest}.webp`,
    srcSet: entry.widths.map((w) => `${entry.base}-${w}.webp ${w}w`).join(', '),
    width: entry.w,
    height: entry.h,
  }
}

function safeDecode(value) {
  try { return decodeURI(value) } catch { return value }
}
