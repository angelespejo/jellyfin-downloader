import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isLogLevel,
  safeLogEvent,
  safeLogMessage,
  sanitizeLogContext,
  selectLogPage,
} from '../../src/lib/logging.ts'
import type { LogEntry, LogLevel } from '../../src/lib/types.ts'

function entry(id: string, level: LogLevel): LogEntry {
  return {
    id,
    level,
    timestamp: `2026-11-23T00:00:0${id}.000Z`,
    event: 'job.ready',
    message: `entry ${id}`,
    context: {},
  }
}

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

test('paginates newest-first log entries and keeps the filtered total', () => {
  const entries = [entry('1', 'info'), entry('2', 'warn'), entry('3', 'error'), entry('4', 'info')]
  const first = selectLogPage(entries, { limit: 2, offset: 0 })
  assert.deepEqual(
    first.entries.map((item) => item.id),
    ['1', '2']
  )
  assert.equal(first.total, 4)

  const second = selectLogPage(entries, { limit: 2, offset: 2 })
  assert.deepEqual(
    second.entries.map((item) => item.id),
    ['3', '4']
  )

  const warnings = selectLogPage(entries, { level: 'warn', limit: 10, offset: 0 })
  assert.deepEqual(
    warnings.entries.map((item) => item.id),
    ['2']
  )
  assert.equal(warnings.total, 1)
})
