import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getJellyfinClient } from '#api/_shared/jellyfin.js'
import { toMovieDetail } from '#api/_shared/media.js'

export const GET: RequestHandler = apiRoute(async ({ params }) => {
  const item = await getJellyfinClient().getMovie(params.id)
  return jsonResponse(toMovieDetail(item))
})
