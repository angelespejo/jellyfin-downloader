import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getJellyfinClient } from '#api/_shared/jellyfin.js'

const ALLOWED_WIDTHS = new Set([160, 300, 600])

export const GET: RequestHandler = apiRoute(async ({ params, url }) => {
  const requested = Number(url.searchParams.get('w') ?? 300)
  const width = ALLOWED_WIDTHS.has(requested) ? requested : 300
  const tag = url.searchParams.get('tag')
  const response = await getJellyfinClient().getImage(params.id, tag, width)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > 15 * 1024 * 1024) {
    await response.body?.cancel()
    return jsonResponse(
      { error: { code: 'IMAGE_TOO_LARGE', message: 'La imagen es demasiado grande' } },
      502
    )
  }
  const headers = new Headers()
  headers.set('Content-Type', response.headers.get('content-type') ?? 'image/jpeg')
  headers.set('Cache-Control', tag ? 'public, max-age=86400, immutable' : 'public, max-age=3600')
  if (length > 0) headers.set('Content-Length', String(length))
  return new Response(response.body, { status: 200, headers })
})
