import test from 'node:test'
import assert from 'node:assert/strict'

import { buildKnowledge } from '../netlify/functions/lib/ai-assistant.mjs'
import { formatEstimatedPrice, products } from '../src/data/products.js'

test('every product has an estimated starting price in whole US dollars', () => {
  for (const product of products) {
    assert.ok(Number.isInteger(product.estimatedPriceUsd) && product.estimatedPriceUsd > 0, product.id)
  }
})

test('prices are shown as "From $X" in dollars only', () => {
  assert.equal(formatEstimatedPrice(1450), 'From $1,450')
  assert.equal(formatEstimatedPrice(4200), 'From $4,200')
  for (const product of products) assert.doesNotMatch(formatEstimatedPrice(product.estimatedPriceUsd), /₹|Rs|INR/)
})

test('estimates stay separate from confirmed prices and out of the assistant', () => {
  for (const product of products) assert.equal(product.price, null, product.id)
  const knowledge = buildKnowledge().map((fact) => `${fact.text} ${fact.context}`).join(' ')
  assert.doesNotMatch(knowledge, /\$\d/)
})
