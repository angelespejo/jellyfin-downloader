import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'
import { serveFileResponse } from '#api/_shared/file-response.js'

async function serve(request: Request, key: string, head: boolean): Promise<Response> {
  const stored = await getLocalDownloadsStore().lookup(key)
  if (!stored) {
    return jsonResponse(
      { error: { code: 'FILE_NOT_FOUND', message: 'The local download does not exist' } },
      404
    )
  }
  return serveFileResponse({
    request,
    path: stored.path,
    filename: stored.meta.filename,
    contentType: stored.meta.contentType,
    head,
  })
}

export const GET: RequestHandler = apiRoute(async ({ request, params }) =>
  serve(request, params.key, false)
)
export const HEAD: RequestHandler = apiRoute(async ({ request, params }) =>
  serve(request, params.key, true)
)
