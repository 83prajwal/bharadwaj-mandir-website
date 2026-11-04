export function normalizeMediaUrl(src) {
  if (typeof src !== 'string') return src

  const trimmed = src.trim()
  if (!trimmed) return trimmed

  try {
    return encodeURI(decodeURI(trimmed))
  } catch {
    return encodeURI(trimmed.replace(/ /g, '%20'))
  }
}
