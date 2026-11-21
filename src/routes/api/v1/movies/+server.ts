import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getJellyfinClient } from '#api/_shared/jellyfin.js'
import { toMovieSummary } from '#api/_shared/media.js'
import { normalizeSearch } from '#lib/format.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'

export const GET: RequestHandler = apiRoute(async ({ url }) => {
  const query = normalizeSearch(url.searchParams.get('q') ?? '')
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0)

  const [all, counts] = await Promise.all([
    getJellyfinClient().listMovies(),
    getLocalDownloadsStore()
      .getMovieCounts()
      .catch(() => new Map<string, number>()),
  ])
  const filtered = query
    ? all.filter((item) => {
        const haystack = `${item.Name} ${item.ProductionYear ?? ''}`
        return normalizeSearch(haystack).includes(query)
      })
    : all

  const page = filtered
    .slice(offset, offset + limit)
    .map((item) => toMovieSummary(item, counts.get(item.Id) ?? 0))
  return jsonResponse({
    items: page,
    total: filtered.length,
    limit,
    offset,
  })
})
