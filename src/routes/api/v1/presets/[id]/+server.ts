import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getSettingsStore } from '#api/_shared/settings.js'

export const GET: RequestHandler = apiRoute(async ({ params }) => {
  const preset = await getSettingsStore().findPreset(params.id)
  if (!preset) {
    return jsonResponse(
      { error: { code: 'PRESET_NOT_FOUND', message: 'The requested preset does not exist' } },
      404
    )
  }
  return jsonResponse({ preset })
})
