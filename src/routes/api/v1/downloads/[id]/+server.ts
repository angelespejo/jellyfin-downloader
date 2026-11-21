import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getJobManager } from '#api/_shared/jobs.js'

export const GET: RequestHandler = apiRoute(async ({ params }) => {
  return jsonResponse(await getJobManager().status(params.id))
})

export const DELETE: RequestHandler = apiRoute(async ({ params }) => {
  return jsonResponse(await getJobManager().cancel(params.id))
})
