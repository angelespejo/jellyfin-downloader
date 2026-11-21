import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getConfig } from '#api/_shared/config.js'
import { getFfmpegInfo } from '#api/_shared/ffmpeg.js'
import { getLocalDownloadsStore } from '#api/_shared/local-downloads.js'

export const GET: RequestHandler = apiRoute(async () => {
  let configOk = true
  let configError: string | null = null
  try {
    getConfig()
  } catch (error) {
    configOk = false
    configError = error instanceof Error ? error.message : 'Invalid configuration'
  }

  const [ffmpeg, storage] = await Promise.all([
    getFfmpegInfo(),
    configOk
      ? getLocalDownloadsStore().storageStatus()
      : Promise.resolve({ enabled: false, usedBytes: 0, objects: 0 }),
  ])

  const ok = configOk && ffmpeg.available
  return jsonResponse(
    {
      ok,
      config: { ok: configOk, error: configError },
      ffmpeg: { available: ffmpeg.available, version: ffmpeg.version },
      localDownloads: storage,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    ok ? 200 : 503
  )
})
