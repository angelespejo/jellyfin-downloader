import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getJellyfinClient, isValidJellyfinId } from '#api/_shared/jellyfin.js'

export const GET: RequestHandler = apiRoute(async ({ params }) => {
  if (!isValidJellyfinId(params.id)) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'Invalid series ID' } }, 400)
  }
  const totalSizeBytes = await getJellyfinClient().getSeriesSize(params.id)
  return jsonResponse({ totalSizeBytes: totalSizeBytes > 0 ? totalSizeBytes : null })
})
