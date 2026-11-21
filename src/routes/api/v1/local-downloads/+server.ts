import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'

const ITEM_ID = /^[0-9a-f]{32}$/i

export const GET: RequestHandler = apiRoute(async ({ url }) => {
  const store = getLocalDownloadsStore()
  if (!store.isEnabled()) {
    return jsonResponse({ enabled: false, items: [], total: 0 })
  }
  const movieId = url.searchParams.get('movieId')
  const seriesId = url.searchParams.get('seriesId')
  if (movieId && !ITEM_ID.test(movieId)) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'Invalid movieId' } }, 400)
  }
  if (seriesId && !ITEM_ID.test(seriesId)) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'Invalid seriesId' } }, 400)
  }
  const all = await store.list()
  const items = all.filter((item) =>
    movieId ? item.movieId === movieId : seriesId ? item.seriesId === seriesId : true
  )
  return jsonResponse({ enabled: true, items, total: items.length })
})
