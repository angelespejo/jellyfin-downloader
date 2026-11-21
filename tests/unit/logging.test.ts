import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isLogLevel,
  safeLogEvent,
  safeLogMessage,
  sanitizeLogContext,
} from '../../src/lib/logging.ts'

test('validates log levels and event names', () => {
  assert.equal(isLogLevel('info'), true)
  assert.equal(isLogLevel('debug'), false)
  assert.equal(safeLogEvent(' Job.Ready '), 'job.ready')
  assert.equal(safeLogEvent('bad event!'), 'app.event')
})

test('sanitizes messages and removes sensitive context keys', () => {
  assert.equal(safeLogMessage('Line one\nLine two'), 'Line one Line two')
  assert.equal(safeLogMessage('Failed at /Users/me/private/file.mkv'), 'Failed at [path]')
  const context = sanitizeLogContext({
    movieId: '123',
    filename: 'Movie.mkv',
    apiKey: 'secret',
    nested: { token: 'hidden', preset: 'MP4 720p' },
    path: '/private/file',
    count: 2,
    ok: true,
    empty: null,
  })
  assert.deepEqual(context, {
    movieId: '123',
    filename: 'Movie.mkv',
    'nested.preset': 'MP4 720p',
    count: 2,
    ok: true,
    empty: null,
  })
})
