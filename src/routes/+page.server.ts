import type { PageServerLoad } from './$types'
import { defaultSettings, getSettingsStore } from '#api/_shared/settings.js'
import type { SettingsDocument } from '#lib/types.js'

export const load: PageServerLoad = async () => {
  let settings: SettingsDocument = defaultSettings()
  let settingsWarning = false
  try {
    const loaded = await getSettingsStore().getWithWarning()
    settings = loaded.document
    settingsWarning = Boolean(loaded.warning)
  } catch {
    settingsWarning = true
  }

  return { settings, settingsWarning }
}
