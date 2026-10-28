import { access, readdir, readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return nested.flat()
}

const sourceFiles = [
  ...(await listFiles('src')).filter((path) => /\.(?:jsx?|json)$/.test(path)),
  'index.html',
  'src/index.css',
]
const source = (await Promise.all(sourceFiles.map((path) => readFile(path, 'utf8')))).join('\n')
const refs = new Set()

for (const match of source.matchAll(/\/(?:images|videos|assets)\/[^\s'"`),]+?\.(?:jpe?g|png|webp|avif|gif|svg|mp4|webm|mov)/gi)) {
  if (!match[0].includes('${')) refs.add(match[0])
}

const pathConstants = new Map([...source.matchAll(/const\s+(\w+Path)\s*=\s*['"]([^'"]+)['"]/g)].map((match) => [match[1], match[2]]))
for (const match of source.matchAll(/\$\{(\w+Path)\}([^`'"\s]+)/g)) {
  const prefix = pathConstants.get(match[1])
  if (prefix) refs.add(`${prefix}${match[2]}`)
}

const missing = []
for (const url of refs) {
  const path = resolve('public', decodeURIComponent(url).replace(/^\//, '').replaceAll('/', sep))
  try { await access(path) } catch { missing.push(url) }
}

if (missing.length) {
  if (missing.length) console.error(`Missing ${missing.length} referenced media file(s):\n${missing.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Checked ${refs.size} referenced media files; all resolve under public/.`)
}
