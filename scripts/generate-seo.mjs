import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { products } from '../src/data/products.js'

async function readConfiguredOrigin() {
  if (process.env.VITE_SITE_URL) return process.env.VITE_SITE_URL
  for (const file of ['.env.production', '.env']) {
    const contents = await readFile(file, 'utf8').catch(() => '')
    const line = contents.split(/\r?\n/).find((entry) => /^\s*VITE_SITE_URL\s*=/.test(entry))
    if (line) return line.replace(/^\s*VITE_SITE_URL\s*=\s*/, '').replace(/\s+#.*$/, '').trim().replace(/^(?:"([^"]*)"|'([^']*)')$/, '$1$2')
  }
  return ''
}

const configuredOrigin = await readConfiguredOrigin()
let origin = null
if (configuredOrigin) {
  try {
    const parsed = new URL(configuredOrigin)
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash) {
      origin = parsed.origin
    }
  } catch {
    // An absent or invalid value intentionally produces no production URLs.
  }
}

const publicPaths = [...new Set([
  '/', '/products', '/custom-mandir', '/gallery', '/about', '/contact', '/faq',
  '/international-delivery', '/privacy', '/terms',
  ...products.map((product) => `/products/${product.id}`),
])]
const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const urls = origin
  ? publicPaths.map((path) => `  <url><loc>${escapeXml(`${origin}${path === '/' ? '/' : path}`)}</loc></url>`).join('\n')
  : ''
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls ? `\n${urls}\n` : ''}</urlset>\n`
await writeFile(resolve('dist/sitemap.xml'), sitemap, 'utf8')

const indexPath = resolve('dist/index.html')
const indexHtml = await readFile(indexPath, 'utf8')
const withoutCanonicals = indexHtml.replace(/\s*<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi, '')
function htmlForPath(path) {
  const canonicalUrl = origin ? `${origin}${path === '/' ? '/' : path}` : null
  const canonicalTag = canonicalUrl ? `\n    <link rel="canonical" href="${escapeXml(canonicalUrl)}" />` : ''
  return withoutCanonicals.replace('</head>', `${canonicalTag}\n  </head>`)
}

await writeFile(indexPath, htmlForPath('/'), 'utf8')
for (const path of publicPaths.slice(1)) {
  const routeIndexPath = resolve('dist', ...path.slice(1).split('/'), 'index.html')
  await mkdir(dirname(routeIndexPath), { recursive: true })
  await writeFile(routeIndexPath, htmlForPath(path), 'utf8')
}

const robots = `User-agent: *\nAllow: /\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`
await writeFile(resolve('dist/robots.txt'), robots, 'utf8')

if (origin) console.info(`Generated sitemap and route canonicals for ${publicPaths.length} URLs on ${origin}.`)
else console.info('Generated an empty sitemap; set VITE_SITE_URL to the confirmed HTTPS production origin before deployment.')
