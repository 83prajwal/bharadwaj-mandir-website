import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const reviewRoot = resolve(process.argv[2] || 'review/assets')
const parseCsv = (text) => {
  const rows = []; let row = []; let field = ''; let quoted = false
  text = text.replace(/^\uFEFF/, '')
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

const [inventoryText, optimizationText, reviewText] = await Promise.all([
  readFile(resolve(reviewRoot, 'asset-inventory.csv'), 'utf8'),
  readFile(resolve(reviewRoot, 'optimization-report.csv'), 'utf8'),
  readFile(resolve(reviewRoot, 'manual-review.csv'), 'utf8'),
])
const optimization = new Map(parseCsv(optimizationText).map((row) => [row.OriginalPath, row]))
const reviews = new Map(parseCsv(reviewText).map((row) => [row.Path, row]))
const products = new Map([
  ['/images/finished/white-marble-mandir.jpg', 'white-marble-mandir'],
  ['/images/finished/peacock-design-mandir.jpg', 'peacock-design-mandir'],
  ['/images/finished/floral-design-mandir.jpg', 'floral-design-mandir'],
  ['/images/finished/ornate-mandir.jpg', 'ornate-traditional-mandir'],
])

const manifest = parseCsv(inventoryText).map((row) => {
  const path = row.CurrentPath
  const report = optimization.get(path)
  const sourceReport = report ? report : [...optimization.values()].find((candidate) => {
    if (candidate.ThumbnailPath === path || candidate.DisplayPath === path) return true
    if (!path.startsWith('/assets/optimized/')) return false
    const stem = (value) => value.split('/').at(-1).toLowerCase().replace(/-w\d+(?=\.webp$)/, '').replace(/\.webp$/, '').replace(/[^a-z0-9]/g, '')
    return stem(path) === stem(candidate.ThumbnailPath || candidate.DisplayPath || '')
  })
  const review = reviews.get(path)
  const category = path.startsWith('/videos/') ? 'video'
    : path.includes('/finished/') || sourceReport?.OriginalPath?.includes('/finished/') ? 'mandir'
      : path.includes('/workshop/') || sourceReport?.OriginalPath?.includes('/workshop/') ? 'workshop_or_product_view'
        : path.includes('/designs/') || sourceReport?.OriginalPath?.includes('/designs/') ? 'design_or_detail'
          : path.includes('/optimized/') ? 'optimized_variant'
            : 'other'
  const active = row.ExistingReferences !== ''
  const status = review?.Status || (row.ExactDuplicateGroup ? 'Duplicate candidate; exact bytes match another file' : active ? 'Approved for current website use' : report ? 'Suitable after optimization' : 'Unused but potentially useful')
  return {
    assetId: `asset-${createHash('sha1').update(path).digest('hex').slice(0, 12)}`,
    originalFilename: row.OriginalFilename,
    finalFilename: row.OriginalFilename,
    currentPath: path,
    finalPath: path,
    fileType: row.Type,
    extension: row.Extension,
    category,
    subject: row.LikelySubject,
    dimensions: row.Width && row.Height ? { width: Number(row.Width), height: Number(row.Height) } : null,
    aspectRatio: row.AspectRatio ? Number(row.AspectRatio) : null,
    originalSizeBytes: Number(row.SizeBytes),
    optimizedSizeBytes: report?.OptimizedBytes ? Number(report.OptimizedBytes) : null,
    optimizedVariants: sourceReport?.ThumbnailPath ? [sourceReport.ThumbnailPath, sourceReport.DisplayPath].filter(Boolean) : [],
    associatedProductId: products.get(path) || null,
    references: row.ExistingReferences ? row.ExistingReferences.split('; ') : [],
    duplicateGroup: row.ExactDuplicateGroup || null,
    status,
    classificationConfidence: row.ClassificationConfidence,
    manualApprovalRequired: Boolean(review) || row.ClassificationConfidence === 'Low' || Boolean(row.ExactDuplicateGroup),
    sourceMapping: { originalPath: sourceReport?.OriginalPath || path, finalPath: path },
  }
})

await writeFile(resolve(reviewRoot, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${manifest.length} manifest records to ${resolve(reviewRoot, 'asset-manifest.json')}`)
