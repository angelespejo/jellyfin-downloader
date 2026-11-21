import type { PageServerLoad } from './$types'
import { defaultSettings, getSettingsStore } from '#api/_shared/settings.js'
import { getJellyfinClient } from '#api/_shared/jellyfin.js'
import { toMovieSummary } from '#api/_shared/media.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'
import type { MovieSummary, SettingsDocument } from '#lib/types.js'

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

  let items: MovieSummary[] = []
  let loadError = false
  try {
    const [catalog, counts] = await Promise.all([
      getJellyfinClient().listCatalog(),
      getLocalDownloadsStore()
        .getMovieCounts()
        .catch(() => new Map<string, number>()),
    ])
    items = catalog.map((item) => toMovieSummary(item, counts.get(item.Id) ?? 0))
  } catch (error) {
    console.error('[page] Could not load Jellyfin:', error)
    loadError = true
  }

  return {
    items,
    settings,
    settingsWarning,
    loadError,
  }
}
