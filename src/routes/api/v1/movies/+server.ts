import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getJellyfinClient } from '#api/_shared/jellyfin.js'
import { toMovieSummary } from '#api/_shared/media.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'

export const GET: RequestHandler = apiRoute(async ({ url }) => {
  const query = (url.searchParams.get('q') ?? '').trim()
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0)

  if (query) {
    const [result, counts] = await Promise.all([
      getJellyfinClient().searchCatalog(query, limit, offset),
      getLocalDownloadsStore()
        .getMovieCounts()
        .catch(() => new Map<string, number>()),
    ])
    const items = result.items.map((item) => toMovieSummary(item, counts.get(item.Id) ?? 0))
    return jsonResponse({ items, total: result.total, limit, offset })
  }

  const [all, counts] = await Promise.all([
    getJellyfinClient().listMovies(),
    getLocalDownloadsStore()
      .getMovieCounts()
      .catch(() => new Map<string, number>()),
  ])

  const page = all
    .slice(offset, offset + limit)
    .map((item) => toMovieSummary(item, counts.get(item.Id) ?? 0))
  return jsonResponse({
    items: page,
    total: all.length,
    limit,
    offset,
  })
})
