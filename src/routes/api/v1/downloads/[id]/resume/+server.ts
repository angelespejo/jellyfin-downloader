import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getJobManager } from '#api/_shared/jobs.js'

export const POST: RequestHandler = apiRoute(async ({ params }) => {
  return jsonResponse(await getJobManager().resume(params.id))
})
