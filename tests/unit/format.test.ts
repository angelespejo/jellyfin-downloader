import assert from 'node:assert/strict'
import test from 'node:test'
import { formatProcessingTime } from '../../src/lib/format.ts'

test('formats processing time from milliseconds', () => {
  assert.equal(formatProcessingTime(null), '—')
  assert.equal(formatProcessingTime(0), '—')
  assert.equal(formatProcessingTime(145_000), '2:25')
  assert.equal(formatProcessingTime(3_725_000), '1:02:05')
})
