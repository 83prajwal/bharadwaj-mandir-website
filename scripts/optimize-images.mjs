// Creates compressed, warm-graded WebP copies of every photo in public/assets
// at up to three widths (480, 960, 1600 px) and writes a manifest the site uses
// to build `srcset` attributes. Originals are never modified.
//
// Requires ffmpeg + ffprobe on PATH (not available on Netlify, so run locally
// and commit the output):   npm run images:optimize
//
// Re-running skips files whose WebP copies already exist. Pass --force to redo.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'

const root = process.cwd()
const sourceRoot = join(root, 'public', 'assets')
const outputRoot = join(root, 'public', 'opt')
const manifestPath = join(root, 'src', 'data', 'imageManifest.json')
const widths = [480, 960, 1600]
const targetBytes = 200 * 1024
const force = process.argv.includes('--force')
// Subtle, consistent warm grade. Low mix keeps white marble looking white.
const grade = 'colortemperature=temperature=5600:mix=0.22,eq=saturation=1.04'

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

function probe(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file], { encoding: 'utf8' })
  const [w, h] = result.stdout.trim().split('x').map(Number)
  return w && h ? { w, h } : null
}

function encode(input, output, width, quality) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-vf', `scale=${width}:-2:flags=lanczos,${grade}`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6', '-metadata', 'comment=', output], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || `ffmpeg failed for ${input}`)
  return statSync(output).size
}

const files = walk(sourceRoot).filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
const manifest = {}
let created = 0
let skipped = 0

for (const file of files) {
  const size = probe(file)
  if (!size) { console.warn(`skip (unreadable): ${file}`); continue }
  const rel = relative(sourceRoot, file).split(sep).join('/')
  const key = `/assets/${rel}`
  const safeBase = rel.slice(0, -extname(rel).length).replace(/[^a-zA-Z0-9/_-]+/g, '-')
  const sizes = widths.filter((w) => w < size.w)
  if (!sizes.length || size.w <= widths.at(-1)) sizes.push(Math.min(size.w, widths.at(-1)))
  const unique = [...new Set(sizes)].sort((a, b) => a - b)

  for (const width of unique) {
    const output = join(outputRoot, `${safeBase}-${width}.webp`)
    if (!force && existsSync(output)) { skipped += 1; continue }
    mkdirSync(dirname(output), { recursive: true })
    let quality = 78
    let bytes = encode(file, output, width, quality)
    while (bytes > targetBytes && quality > 45) {
      quality -= 8
      bytes = encode(file, output, width, quality)
    }
    created += 1
  }
  manifest[key] = { w: size.w, h: size.h, base: `/opt/${safeBase}`, widths: unique }
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Images: ${Object.keys(manifest).length} sources, ${created} WebP files written, ${skipped} already present.`)
console.log(`Manifest: ${relative(root, manifestPath)}`)
