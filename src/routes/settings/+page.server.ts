import type { PageServerLoad } from './$types'
import { defaultSettings, getSettingsStore } from '#api/_shared/settings.js'
import type { SettingsDocument } from '#lib/types.js'

export const load: PageServerLoad = async () => {
  let settings: SettingsDocument = defaultSettings()
  let warning = false
  try {
    const loaded = await getSettingsStore().getWithWarning()
    settings = loaded.document
    warning = Boolean(loaded.warning)
  } catch {
    warning = true
  }

  return { settings, warning }
}
