import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contentTypeForExtension,
  encodeContentDisposition,
  parseRangeHeader,
  sanitizeFilenamePart,
  sourceAudioExtension,
} from '#api/_shared/files.ts'

test('sanitizeFilenamePart removes dangerous characters and enforces length', () => {
  assert.equal(sanitizeFilenamePart('  ../Película: "test"  '), 'Película test')
  assert.equal(sanitizeFilenamePart('\u0000\u0007'), 'file')
  assert.ok(sanitizeFilenamePart('a'.repeat(300), 40).length <= 40)
})

test('encodeContentDisposition prevents header injection', () => {
  const value = encodeContentDisposition('Movie\r\nX-Test: 1".mkv')
  assert.ok(!value.includes('\r'))
  assert.ok(!value.includes('\n'))
  assert.ok(value.startsWith('attachment;'))
})

test('parseRangeHeader handles valid, suffix and invalid ranges', () => {
  assert.deepEqual(parseRangeHeader('bytes=0-99', 1000), { start: 0, end: 99 })
  assert.deepEqual(parseRangeHeader('bytes=900-', 1000), { start: 900, end: 999 })
  assert.deepEqual(parseRangeHeader('bytes=-50', 1000), { start: 950, end: 999 })
  assert.equal(parseRangeHeader(null, 1000), null)
  assert.equal(parseRangeHeader('bytes=1000-', 1000), 'invalid')
  assert.equal(parseRangeHeader('bytes=abc-def', 1000), 'invalid')
})

test('extensions and content types', () => {
  assert.equal(contentTypeForExtension('mkv'), 'video/x-matroska')
  assert.equal(contentTypeForExtension('srt'), 'application/x-subrip; charset=utf-8')
  assert.equal(sourceAudioExtension('aac'), 'm4a')
  assert.equal(sourceAudioExtension('dts'), 'dts')
})
