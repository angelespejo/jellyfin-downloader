import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'

const ITEM_ID = /^[0-9a-f]{32}$/i

export const GET: RequestHandler = apiRoute(async ({ url }) => {
  const movieId = url.searchParams.get('movieId')
  const seriesId = url.searchParams.get('seriesId')
  if ((movieId && !ITEM_ID.test(movieId)) || (seriesId && !ITEM_ID.test(seriesId))) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'Invalid item id' } }, 400)
  }
  const store = getLocalDownloadsStore()
  if (!store.isEnabled()) return jsonResponse({ enabled: false, total: 0 })
  const counts = await store.getMovieCounts()
  const total = movieId ? (counts.get(movieId) ?? 0) : seriesId ? (counts.get(seriesId) ?? 0) : 0
  return jsonResponse({ enabled: true, total })
})
