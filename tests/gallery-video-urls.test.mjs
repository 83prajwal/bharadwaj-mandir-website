import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeMediaUrl } from '../src/lib/mediaUtils.js'

test('normalizes gallery video paths with spaces and parentheses', () => {
  assert.equal(normalizeMediaUrl('/videos/20260422_144518 (1).mp4'), '/videos/20260422_144518%20(1).mp4')
  assert.equal(normalizeMediaUrl('/videos/stone-carving.mp4'), '/videos/stone-carving.mp4')
  assert.equal(normalizeMediaUrl('/videos/20260422_144518%20%281%29.mp4'), '/videos/20260422_144518%20(1).mp4')
})
