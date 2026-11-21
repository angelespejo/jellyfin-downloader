import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse, readJson } from '#api/_shared/api.js'
import { getJobManager } from '#api/_shared/jobs.js'
import type { LocalDownloadsCheckRequest } from '#lib/types.js'

export const POST: RequestHandler = apiRoute(async ({ request }) => {
  const body = (await readJson(request)) as unknown as LocalDownloadsCheckRequest
  return jsonResponse(await getJobManager().check(body))
})
