import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { deleteLogs, logsRetentionDays, readLogFile, readLogs } from '#api/_shared/logger.js'
import { isLogLevel } from '#lib/logging.js'
import type { LogsResponse } from '#lib/types.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function dateParam(url: URL): string | null | 'invalid' {
  const value = url.searchParams.get('date')
  if (!value) return null
  return DATE_PATTERN.test(value) ? value : 'invalid'
}

export const GET: RequestHandler = apiRoute(async ({ url }) => {
  const date = dateParam(url)
  if (date === 'invalid') {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'Invalid date' } }, 400)
  }
  if (url.searchParams.get('download') === '1') {
    const file = await readLogFile(date)
    if (!file) {
      return jsonResponse(
        { error: { code: 'FILE_NOT_FOUND', message: 'The log file does not exist' } },
        404
      )
    }
    return new Response(file.content, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  }
  const levelValue = url.searchParams.get('level')
  if (levelValue && !isLogLevel(levelValue)) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'Invalid log level' } }, 400)
  }
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 200) || 200))
  const entries = await readLogs({
    level: isLogLevel(levelValue) ? levelValue : null,
    date,
    limit,
  })
  const body: LogsResponse = {
    entries,
    total: entries.length,
    date,
    retentionDays: logsRetentionDays(),
  }
  return jsonResponse(body)
})

export const DELETE: RequestHandler = apiRoute(async ({ url, request }) => {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse(
      {
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' },
      },
      415
    )
  }
  const date = dateParam(url)
  if (date === 'invalid') {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'Invalid date' } }, 400)
  }
  const removed = await deleteLogs(date)
  return jsonResponse({ removed })
})
