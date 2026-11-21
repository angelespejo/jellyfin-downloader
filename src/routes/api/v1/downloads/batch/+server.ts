import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse, readJson } from '#api/_shared/api.js'
import { getJobManager } from '#api/_shared/jobs.js'
import type { CreateBatchDownloadRequest } from '#lib/types.js'

export const POST: RequestHandler = apiRoute(async ({ request }) => {
  const body = (await readJson(request)) as unknown as CreateBatchDownloadRequest
  const result = await getJobManager().createBatch(body)
  return jsonResponse(result, 202, {
    'Retry-After': '1',
  })
})
