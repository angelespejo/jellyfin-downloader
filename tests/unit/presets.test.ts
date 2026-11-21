import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PRESET_TAG,
  normalizePresetTags,
  parsePresetTagInput,
  PresetTagError,
  slugifyPresetTag,
} from '../../src/lib/presets.ts'

test('defaults missing preset tags to default', () => {
  assert.deepEqual(normalizePresetTags(undefined), [DEFAULT_PRESET_TAG])
  assert.deepEqual(normalizePresetTags([]), [DEFAULT_PRESET_TAG])
  assert.deepEqual(normalizePresetTags(['']), [DEFAULT_PRESET_TAG])
})

test('normalizes, deduplicates and slugifies preset tags', () => {
  assert.equal(slugifyPresetTag('Móvil Rápido'), 'movil-rapido')
  assert.deepEqual(normalizePresetTags(['Default', 'mobile', 'mobile', 'TV']), [
    'default',
    'mobile',
    'tv',
  ])
})

test('parses comma-separated tag input', () => {
  assert.deepEqual(parsePresetTagInput('default, Mobile, mobile'), ['default', 'mobile'])
  assert.deepEqual(parsePresetTagInput('  '), [DEFAULT_PRESET_TAG])
})

test('rejects too many tags and non-array values', () => {
  assert.throws(() => normalizePresetTags([1]), PresetTagError)
  assert.throws(
    () => normalizePresetTags(Array.from({ length: 21 }, (_, index) => `tag-${index}`)),
    PresetTagError
  )
})
