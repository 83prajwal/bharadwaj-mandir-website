import { readFile, writeFile } from 'node:fs/promises'

const galleryPath = new URL('../src/data/galleryAssets.json', import.meta.url)
const gallery = JSON.parse(await readFile(galleryPath, 'utf8'))
const excluded = new Set([
  '/images/finished/IMG-20260327-WA0055.jpg',
  '/images/finished/IMG-20260303-WA0019.jpg',
  '/images/finished/IMG-20260509-WA0043.jpg',
  '/images/finished/IMG-20260509-WA0055.jpg',
  '/images/workshop/IMG-20260513-WA0022.jpg',
])

const items = gallery.flatMap((item) => {
  const originalPath = item.image
  if (excluded.has(originalPath)) return []

  if (originalPath.startsWith('/images/finished/')) {
    item.category = 'Mandir Designs'
    item.title = 'Mandir photograph'
    item.alt = 'Photograph of a marble mandir design'
  } else if (originalPath.includes('/workshop/')) {
    item.category = 'Workshop & Product Views'
    item.title = 'Workshop and product photograph'
    item.alt = 'Marble mandir or component photographed in a work or product setting'
  } else if (originalPath.includes('/designs/20260513-')) {
    item.category = 'Carving & Design Details'
    item.title = 'Carved stone detail'
    item.alt = 'Close view of a carved stone panel'
  } else if (originalPath.includes('/designs/img-20260327-wa')) {
    item.category = 'Carving & Design Details'
    item.title = 'Carved marble component'
    item.alt = 'Carved marble component shown from a workshop angle'
  } else if (originalPath === '/images/designs/IMG-20260514-WA0021.jpg') {
    item.category = 'Design References'
    item.title = 'Mandir design reference with technical views'
    item.alt = 'Mandir concept image accompanied by technical views and measurements'
  } else if (originalPath === '/images/designs/custom-white-marble-elephant-fountain-shree-yantra.jpg') {
    item.category = 'Design References'
    item.title = 'Custom mandir design drawing'
    item.alt = 'Mandir design drawing showing front, side and plan views'
  }
  return [item]
})

await writeFile(galleryPath, `${JSON.stringify(items, null, 2)}\n`)
console.log(`Updated ${items.length} gallery records; ${excluded.size} unsuitable or unconfirmed images remain retained in the source library.`)
