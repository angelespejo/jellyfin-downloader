import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'
import { PAGE_SIZE } from '#const'

const ITEM_ID = /^[0-9a-f]{32}$/i

export const GET: RequestHandler = apiRoute(async ({ url }) => {
  const store = getLocalDownloadsStore()
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get('limit') ?? PAGE_SIZE) || PAGE_SIZE)
  )
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0)
  if (!store.isEnabled()) {
    return jsonResponse({
      enabled: false,
      items: [],
      total: 0,
      limit,
      offset,
      usedBytes: 0,
      objects: 0,
    })
  }
  const movieId = url.searchParams.get('movieId')
  const seriesId = url.searchParams.get('seriesId')
  if (movieId && !ITEM_ID.test(movieId)) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'Invalid movieId' } }, 400)
  }
  if (seriesId && !ITEM_ID.test(seriesId)) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'Invalid seriesId' } }, 400)
  }
  const page = await store.listPage({ limit, offset, movieId, seriesId })
  return jsonResponse({ enabled: true, ...page, limit, offset })
})
