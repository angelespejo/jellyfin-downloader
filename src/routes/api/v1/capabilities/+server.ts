import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getCapabilities } from '#api/_shared/capabilities.js'

export const GET: RequestHandler = apiRoute(async () => {
  return jsonResponse(await getCapabilities())
})
