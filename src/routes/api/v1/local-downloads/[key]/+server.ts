import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'
import { logEvent } from '#api/_shared/logger.js'

export const GET: RequestHandler = apiRoute(async ({ params }) => {
  const item = await getLocalDownloadsStore().get(params.key)
  if (!item) {
    return jsonResponse(
      { error: { code: 'FILE_NOT_FOUND', message: 'The local download does not exist' } },
      404
    )
  }
  return jsonResponse({ item })
})

export const DELETE: RequestHandler = apiRoute(async ({ params }) => {
  const store = getLocalDownloadsStore()
  const item = await store.get(params.key)
  const removed = await store.remove(params.key)
  if (!removed) {
    return jsonResponse(
      { error: { code: 'FILE_NOT_FOUND', message: 'The local download does not exist' } },
      404
    )
  }
  void logEvent(
    'info',
    'local-download.deleted',
    `Deleted local download ${item?.filename ?? params.key}`,
    {
      key: params.key,
      movieId: item?.movieId ?? '',
      filename: item?.filename ?? '',
    }
  )
  return jsonResponse({ removed: true })
})
