import assert from 'node:assert/strict'
import test from 'node:test'
import { envBoolean, pickFirstNonEmpty } from '#api/_shared/env-values.ts'

test('pickFirstNonEmpty prefers the first non-empty value', () => {
  assert.equal(pickFirstNonEmpty('https://primary', 'https://legacy'), 'https://primary')
})

test('pickFirstNonEmpty falls back to the deprecated alias', () => {
  assert.equal(pickFirstNonEmpty('', '  https://legacy  '), 'https://legacy')
  assert.equal(pickFirstNonEmpty('   ', 'https://legacy'), 'https://legacy')
})

test('pickFirstNonEmpty returns an empty string when every value is blank', () => {
  assert.equal(pickFirstNonEmpty('', undefined, '  '), '')
})

test('envBoolean uses the fallback when the value is empty', () => {
  assert.equal(envBoolean('', true), true)
  assert.equal(envBoolean(undefined, true), true)
  assert.equal(envBoolean('   ', false), false)
})

test('envBoolean recognises common truthy values', () => {
  for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
    assert.equal(envBoolean(value, false), true, value)
  }
  assert.equal(envBoolean('false', true), false)
  assert.equal(envBoolean('0', true), false)
})
