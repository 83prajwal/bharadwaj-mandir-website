import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('review/assets')
const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
const parseCsv = (text) => {
  const rows = []; let row = []; let field = ''; let quoted = false
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
const inventoryPath = resolve(root, 'asset-inventory.csv')
const inventoryText = await readFile(inventoryPath, 'utf8')
const inventoryRows = parseCsv(inventoryText)
const optimizedPath = '/assets/optimized/finished/mandir-product-0022-w900.webp'
const originalPath = '/images/finished/IMG-20260224-WA0022.jpg'
if (!inventoryRows.some((row) => row.CurrentPath === optimizedPath)) {
  inventoryRows.push(Object.fromEntries(['OriginalFilename', 'CurrentPath', 'Extension', 'Type', 'SizeBytes', 'Width', 'Height', 'AspectRatio', 'LikelySubject', 'ClassificationConfidence', 'ExactDuplicateGroup', 'ExistingReferences', 'RecommendedDestination', 'RecommendedUsage', 'Optimization'].map((key, index) => [key, ['mandir-product-0022-w900.webp', optimizedPath, '.webp', 'image', '54440', '600', '900', '0.667', 'Optimized front-facing mandir photograph for homepage hero', 'High', '', 'src\\components\\Hero.jsx', optimizedPath, 'Homepage hero', '900px WebP; resized from 1024x1536 original; source retained'][index]])))
}

const videoSubjects = new Map([
  ['carving-detail.mp4', 'Close-up video of a powered tool carving a stone panel'],
  ['carving-sequence.mp4', 'Video showing a carved relief panel in progress'],
  ['marble-surface-grinding.mp4', 'Artisan grinding a marble panel surface'],
  ['panel-carving.mp4', 'Close-up video of carved symbols on a stone panel'],
  ['stone-carving-prep.mp4', 'Artisans preparing and carving a marble panel'],
  ['stone-carving.mp4', 'Artisan carving a marble relief panel'],
  ['surface-polishing.mp4', 'Powered finishing work on a marble panel'],
])
for (const row of inventoryRows) {
  if (!videoSubjects.has(row.OriginalFilename)) continue
  row.LikelySubject = videoSubjects.get(row.OriginalFilename)
  row.ClassificationConfidence = 'Medium'
  row.RecommendedUsage = 'Workshop process video; browser playback still needs confirmation'
  row.Optimization = 'Video sampled at 2 seconds; FFmpeg reported stream warnings; preload none'
}
const inventoryHeaders = Object.keys(inventoryRows[0] || {})
await writeFile(inventoryPath, `${[inventoryHeaders.join(','), ...inventoryRows.map((row) => inventoryHeaders.map((key) => csvEscape(row[key])).join(','))].join('\r\n')}\r\n`)

const manualPath = resolve(root, 'manual-review.csv')
const manualText = await readFile(manualPath, 'utf8')
const reviewRows = parseCsv(manualText)
const currentReviews = new Set(reviewRows.map((row) => row.Path))
for (const name of videoSubjects.keys()) {
  const path = `/videos/${name}`
  if (!currentReviews.has(path)) reviewRows.push({ Path: path, Status: 'Needs manual review', Reason: 'Frame extraction showed marble-working content, but FFmpeg reported malformed-stream warnings; verify full playback in a browser.', OriginalRetained: 'true' })
}
const manualHeaders = ['Path', 'Status', 'Reason', 'OriginalRetained']
await writeFile(manualPath, `${[manualHeaders.join(','), ...reviewRows.map((row) => manualHeaders.map((key) => csvEscape(row[key])).join(','))].join('\r\n')}\r\n`)

const optimizationPath = resolve(root, 'optimization-report.csv')
let optimization = await readFile(optimizationPath, 'utf8')
if (!optimization.includes(optimizedPath)) {
  optimization = `${optimization.trimEnd()}\r\n${[originalPath, 'IMG-20260224-WA0022.jpg', '153855', optimizedPath, '', '54440', '99415', '64.6', '900', '84', 'True'].map(csvEscape).join(',')}\r\n`
  await writeFile(optimizationPath, optimization)
}

const duplicatePath = resolve(root, 'duplicate-candidates.csv')
const duplicateText = await readFile(duplicatePath, 'utf8')
const duplicateRows = duplicateText.trim().split(/\r?\n/).slice(1).map((line) => line.replaceAll('"', '').split(','))
const groups = new Map()
for (const [hash, path, bytes] of duplicateRows) {
  if (!hash || !path) continue
  if (!groups.has(hash)) groups.set(hash, [])
  groups.get(hash).push({ path, bytes })
}
const output = ['Group,Paths,Assessment,Action,Hash,Bytes']
for (const [hash, members] of groups) {
  if (members.length < 2) continue
  output.push([`exact-${hash.slice(0, 12)}`, members.map((member) => member.path).join('; '), 'Exact duplicate bytes; likely redundant generated variants', 'Retain originals; confirm references before any cleanup', hash, members[0].bytes].map(csvEscape).join(','))
}
output.push(['workshop-batch-views', '/images/workshop/IMG-20260412-WA0012.jpg; /images/workshop/IMG-20260412-WA0016.jpg; /images/workshop/IMG-20260412-WA0017.jpg; /images/workshop/IMG-20260412-WA0018.jpg; /images/workshop/IMG-20260412-WA0020.jpg; /images/workshop/IMG-20260412-WA0021.jpg; /images/workshop/IMG-20260412-WA0024.jpg; /images/workshop/IMG-20260412-WA0027.jpg', 'Visually similar outdoor batch photographs; different framing, exact duplicates not detected', 'Retain originals; select only distinct views for website use', '', ''].map(csvEscape).join(','))
await writeFile(duplicatePath, `${output.join('\r\n')}\r\n`)
