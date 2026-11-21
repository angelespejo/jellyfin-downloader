import type { LayoutServerLoad } from './$types'
import { getCapabilities } from '#api/_shared/capabilities.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'
import type { Capabilities } from '#lib/types.js'

const fallbackCapabilities: Capabilities = {
  ffmpeg: { available: false, version: null },
  hardware: { available: false, mode: null, codecs: [] },
  burnIn: false,
  containers: ['mkv', 'mp4', 'webm'],
  videoCodecs: { mkv: ['copy'], mp4: ['copy'], webm: ['copy'] },
  audioCodecs: { mkv: ['copy'], mp4: ['copy'], webm: ['copy'] },
  maxConcurrentJobs: 1,
  maxQueuedJobs: 20,
  localDownloads: { enabled: false },
}

export const load: LayoutServerLoad = async ({ locals }) => {
  let capabilities = fallbackCapabilities
  try {
    capabilities = await getCapabilities()
  } catch {
    // invalid configuration or ffmpeg unavailable
  }

  let storage = { enabled: false, usedBytes: 0, objects: 0 }
  try {
    storage = await getLocalDownloadsStore().storageStatus()
  } catch {
    // invalid configuration
  }

  return {
    locale: locals.locale,
    localeMode: locals.localeMode,
    themeMode: locals.themeMode,
    capabilities,
    storage,
  }
}
