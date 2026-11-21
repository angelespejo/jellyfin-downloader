import type { RequestHandler } from './$types'
import { jsonResponse } from '#api/_shared/api.js'
import { openapiDocument } from '#api/_shared/openapi.js'

export const GET: RequestHandler = async () => {
  return jsonResponse(openapiDocument)
}
