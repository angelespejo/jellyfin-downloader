import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getJellyfinClient } from '#api/_shared/jellyfin.js'
import { mediaKind, toSeriesDetail } from '#api/_shared/media.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'

export const GET: RequestHandler = apiRoute(async ({ params }) => {
  const client = getJellyfinClient()
  const series = await client.getMovie(params.id)
  if (mediaKind(series) !== 'series') {
    return jsonResponse(
      { error: { code: 'NOT_A_SERIES', message: 'The requested item is not a series' } },
      400
    )
  }
  const [episodes, counts] = await Promise.all([
    client.getSeriesEpisodes(series.Id),
    getLocalDownloadsStore()
      .getMovieCounts()
      .catch(() => new Map<string, number>()),
  ])
  return jsonResponse(toSeriesDetail(series, episodes.items, counts, episodes.unavailable))
})
