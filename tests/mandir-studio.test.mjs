import test from 'node:test'
import assert from 'node:assert/strict'
import { activeConfigEntries, defaults, drawerGrid, geometryErrors, normalizeConfig, validate } from '../src/pages/mandir-studio/lib/config.ts'

test('parametric starter design is valid and has no selected legacy model family', () => {
  assert.equal(defaults.designFamily, 'Parametric')
  assert.deepEqual(validate(defaults), [])
})

test('supported roof, pillar, material and lighting choices validate', () => {
  for (const roof of ['Flat', 'Shikhar', 'Dome', 'Stepped', 'Cornice', 'Minimal']) {
    assert.deepEqual(geometryErrors({ ...defaults, roof }), [])
  }
  for (const pillars of [0, 2, 4, 6]) assert.deepEqual(geometryErrors({ ...defaults, pillars }), [])
  for (const material of ['White', 'Green', 'Pink', 'Beige', 'Black']) {
    assert.deepEqual(geometryErrors({ ...defaults, material }), [])
  }
})

test('geometry updates retain the requested dimensions and report conflicts', () => {
  const custom = normalizeConfig({ ...defaults, width: 1475, depth: 760, height: 2440 })
  assert.equal(custom.width, 1475)
  assert.equal(custom.depth, 760)
  assert.equal(custom.height, 2440)
  assert.ok(validate({ ...custom, ceiling: 2300 }).some((warning) => warning.includes('ceiling')))
})

test('all supported drawer counts and layouts retain the requested count', () => {
  for (let count = 0; count <= 8; count += 1) {
    for (const layout of ['Horizontal', 'Stacked', 'Grid']) {
      assert.equal(drawerGrid({ ...defaults, drawerCount: count, drawerLayout: layout }).count, count)
    }
  }
})

test('component material and surface-detail values appear in the design summary', () => {
  const design = { ...defaults, materialRoof: 'Green', backCarving: 'Heavy', backPattern: 'Lotus', jaliPattern: 'Arch' }
  const entries = new Map(activeConfigEntries(design))
  assert.equal(entries.get('materialRoof'), 'Green')
  assert.equal(entries.get('backCarving'), 'Heavy')
  assert.equal(entries.get('backPattern'), 'Lotus')
  assert.equal(entries.get('jaliPattern'), 'Arch')
})
