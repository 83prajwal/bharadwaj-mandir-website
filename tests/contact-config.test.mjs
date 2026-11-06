import test from 'node:test'
import assert from 'node:assert/strict'

import { designWhatsappMessage, whatsappUrl, WHATSAPP_NUMBER } from '../src/config/contact.js'
import { galleryExcludedIds } from '../src/data/galleryExclusions.js'
import { galleryImages } from '../src/data/products.js'

test('the default WhatsApp link carries the encoded enquiry message', () => {
  assert.equal(WHATSAPP_NUMBER, '919953836555')
  const url = new URL(whatsappUrl())
  assert.equal(url.origin + url.pathname, 'https://wa.me/919953836555')
  assert.equal(url.searchParams.get('text'), 'Hello Bharadwaj Mandir, I would like to enquire about a mandir.')
})

test('design messages include the number and name', () => {
  const message = designWhatsappMessage(1, 'White Mandir with Peacock Motif')
  assert.equal(message, 'Hi, I’m interested in Design 02: White Mandir with Peacock Motif.')
  assert.equal(new URL(whatsappUrl(message)).searchParams.get('text'), message)
})

test('skipped collage images stay out of the gallery, and videos stay in', () => {
  const ids = new Set(galleryImages.map((item) => item.id))
  for (const id of galleryExcludedIds) assert.equal(ids.has(id), false, id)
  assert.equal(galleryImages.filter((item) => item.video).length, 7)
})
