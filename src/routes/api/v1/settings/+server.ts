import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse, readJson } from '#api/_shared/api.js'
import { getSettingsStore } from '#api/_shared/settings.js'
import type { SettingsDocument } from '#lib/types.js'
import { logEvent } from '#api/_shared/logger.js'

export const GET: RequestHandler = apiRoute(async () => {
  const store = getSettingsStore()
  const { document, warning } = await store.getWithWarning()
  return jsonResponse({ settings: document, warning })
})

export const PUT: RequestHandler = apiRoute(async ({ request }) => {
  const body = (await readJson(request, 256 * 1024)) as unknown as SettingsDocument
  if (!body || typeof body !== 'object' || !Number.isInteger(body.revision)) {
    return jsonResponse(
      { error: { code: 'INVALID_SETTINGS', message: 'Missing configuration revision' } },
      400
    )
  }
  const updated = await getSettingsStore().save(body, body.revision)
  void logEvent('info', 'settings.saved', `Settings saved at revision ${updated.revision}`, {
    revision: updated.revision,
    presets: updated.presets.length,
  })
  return jsonResponse({ settings: updated, warning: null })
})
