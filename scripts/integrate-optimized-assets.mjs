import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const reviewRoot = resolve(process.argv[2] || 'review/assets')
const galleryPath = resolve(process.argv[3] || 'src/data/galleryAssets.json')

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '')
  const rows = []
  let row = []; let field = ''; let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted && char === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(field); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field); field = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [headers, ...data] = rows
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

const [optimizationCsv, inventoryCsv, galleryText] = await Promise.all([
  readFile(resolve(reviewRoot, 'optimization-report.csv'), 'utf8'),
  readFile(resolve(reviewRoot, 'asset-inventory.csv'), 'utf8'),
  readFile(galleryPath, 'utf8'),
])
const variants = new Map(parseCsv(optimizationCsv).filter((row) => row.ThumbnailPath).map((row) => [row.OriginalPath, row]))
const dimensions = new Map(parseCsv(inventoryCsv).map((row) => [row.CurrentPath, { width: Number(row.Width) || undefined, height: Number(row.Height) || undefined }]))
const excluded = new Map([
  ['/images/finished/IMG-20260224-WA0027.jpg', 'Needs Review: isolated product image appears to be a rendering; verify before presenting as a completed product.'],
  ['/images/finished/IMG-20260303-WA0019.jpg', 'Needs Review: incomplete or partial mandir assembly; unsuitable for completed-product gallery.'],
  ['/images/finished/IMG-20260327-WA0055.jpg', 'Excluded: image carries another retailer’s logo and promotional text.'],
  ['/images/finished/IMG-20260509-WA0043.jpg', 'Needs Review: polished interior image appears to be a visualization; verify before presenting as a completed project.'],
  ['/images/finished/IMG-20260509-WA0055.jpg', 'Needs Review: close-up appears to be a visualization; verify before presenting as a completed project.'],
  ['/images/workshop/IMG-20260513-WA0022.jpg', 'Excluded: rendered mandir concept, not a workshop photograph or confirmed completed product.'],
  ['/images/designs/IMG-20260430-WA0017.jpg', 'Needs Review: marked room photograph; project relationship is unconfirmed and it is not a product or design image.'],
])

const reviewRows = [...excluded].map(([path, reason]) => ({
  Path: path,
  Status: reason.startsWith('Excluded') ? 'Unsuitable for customer-facing use' : 'Needs manual review',
  Reason: reason,
  OriginalRetained: true,
}))
const csvEscape = (value) => `"${String(value).replaceAll('"', '""')}"`
await writeFile(resolve(reviewRoot, 'manual-review.csv'), [
  'Path,Status,Reason,OriginalRetained',
  ...reviewRows.map((row) => Object.values(row).map(csvEscape).join(',')),
].join('\n'))

const sourceItems = JSON.parse(galleryText.replace(/^\uFEFF/, ''))
const galleryItems = sourceItems.flatMap((item) => {
  if (excluded.has(item.image)) return []
  const originalPath = item.image
  const size = dimensions.get(originalPath)
  if (size?.width && size?.height) Object.assign(item, size)
  const variant = variants.get(originalPath)
  if (variant) {
    item.image = variant.ThumbnailPath
    item.largeImage = variant.DisplayPath
    item.srcSet = `${variant.ThumbnailPath} 900w, ${variant.DisplayPath} 2000w`
  }
  if (originalPath === '/images/designs/IMG-20260514-WA0021.jpg') {
    item.title = 'Illustrated mandir design reference'
    item.alt = 'Bharadwaj Mandir illustrated marble mandir concept with technical views'
  }
  if (originalPath === '/images/designs/custom-white-marble-elephant-fountain-shree-yantra.jpg') {
    item.title = 'Custom mandir design drawing'
    item.alt = 'Bharadwaj Mandir design drawing showing front, side and plan views'
  }
  return [item]
})
await writeFile(galleryPath, `${JSON.stringify(galleryItems, null, 2)}\n`)
console.log(`Gallery entries retained: ${galleryItems.length}; excluded or held for review: ${excluded.size}; optimized gallery records: ${galleryItems.filter((item) => item.srcSet).length}`)
