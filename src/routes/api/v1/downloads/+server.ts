import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse, readJson } from '#api/_shared/api.js'
import { getJobManager } from '#api/_shared/jobs.js'
import type { CreateDownloadRequest, DownloadQueueResponse } from '#lib/types.js'

export const GET: RequestHandler = apiRoute(async ({ url }) => {
  const state = url.searchParams.get('state') === 'all' ? 'all' : 'active'
  const parsed = Number(url.searchParams.get('limit') ?? 50)
  const limit = Number.isFinite(parsed) ? parsed : 50
  const result = await getJobManager().list({ state, limit })
  const body: DownloadQueueResponse = result
  return jsonResponse(body)
})

export const POST: RequestHandler = apiRoute(async ({ request }) => {
  const body = (await readJson(request)) as unknown as CreateDownloadRequest
  const status = await getJobManager().create(body)
  const headers = new Headers({ Location: `/api/v1/downloads/${status.id}` })
  if (status.state !== 'ready') headers.set('Retry-After', '1')
  return jsonResponse(status, status.state === 'ready' ? 200 : 202, headers)
})
