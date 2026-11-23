import { mkdir } from 'node:fs/promises'
import { JELLYFIN_SERVER, JELLYFIN_URL } from '$app/env/private'
import { getConfig, type ServerConfig } from './config.js'
import { getFfmpegInfo } from './ffmpeg.js'
import { detectHardware, hardwareModeLabel } from './hardware.js'
import { JellyfinError, getJellyfinClient } from './jellyfin.js'
import { getJobManager } from './jobs.js'
import { getLocalDownloadsStore } from './local-downloads.js'
import { logEvent } from './logger.js'
import { getSettingsStore } from './settings.js'

const START_KEY = Symbol.for('jellyfin-downloader.bootstrap.started')
const SHUTDOWN_KEY = Symbol.for('jellyfin-downloader.bootstrap.shutdown')

function readConfig(): ServerConfig | null {
  try {
    return getConfig()
  } catch {
    return null
  }
}

async function prepareStorage(config: ServerConfig): Promise<void> {
  try {
    await mkdir(config.jobsDir, { recursive: true })
    await mkdir(config.logsDir, { recursive: true })
    if (config.localDownloadsEnabled) await getLocalDownloadsStore().ensureReady()

    const { document, warning, created } = await getSettingsStore().getWithWarning()
    if (warning) {
      console.warn(`[startup] ${warning}`)
      void logEvent('warn', 'settings.unreadable', warning)
    } else {
      void logEvent(
        'info',
        created ? 'settings.created' : 'settings.loaded',
        created ? 'Created the settings file with factory defaults' : 'Loaded the settings file',
        { revision: document.revision, presets: document.presets.length }
      )
    }
    void logEvent('info', 'storage.ready', 'Data directories are ready', {
      localDownloads: config.localDownloadsEnabled,
    })
  } catch (error) {
    console.error('[startup] Could not prepare the data directories:', error)
    console.error(
      '[startup] In Docker the container runs as UID 1000. Fix the mount with: sudo chown -R 1000:1000 ./data'
    )
    void logEvent('error', 'storage.error', 'Could not prepare the data directories')
  }
}

async function restoreJobs(): Promise<void> {
  try {
    await getJobManager().ready()
  } catch (error) {
    console.error('[startup] Could not restore download jobs:', error)
    void logEvent('error', 'jobs.restore_failed', 'Could not restore download jobs')
  }
}

async function probeJellyfin(): Promise<void> {
  try {
    const info = await getJellyfinClient().getSystemInfo()
    const version = info.Version ?? 'unknown'
    console.log(`[startup] Jellyfin connected (${version})`)
    void logEvent('info', 'jellyfin.connected', 'Connected to Jellyfin', { version })
  } catch (error) {
    console.warn(
      '[startup] Could not connect to Jellyfin. Check JELLYFIN_URL and JELLYFIN_API_KEY.'
    )
    void logEvent('warn', 'jellyfin.unreachable', 'Could not connect to Jellyfin at startup', {
      status: error instanceof JellyfinError ? error.status : null,
    })
  }
}

async function inspectFfmpeg(): Promise<void> {
  const info = await getFfmpegInfo()
  if (!info.available) {
    console.warn('[startup] ffmpeg is not available:', info.error ?? 'unknown error')
    void logEvent('warn', 'ffmpeg.unavailable', 'ffmpeg is not available')
    return
  }
  const version = /ffmpeg version (\S+)/.exec(info.version ?? '')?.[1] ?? info.version ?? ''
  const hardware = await detectHardware(info.encoders)
  console.log(
    `[startup] ffmpeg ${version} · ${hardware ? hardwareModeLabel(hardware.mode) : 'software'}`
  )
  void logEvent('info', 'ffmpeg.ready', `ffmpeg ${version} ready`, {
    hardware: hardware?.mode ?? 'software',
  })
}

async function run(): Promise<void> {
  const config = readConfig()

  if (!config) {
    console.error('[startup] Invalid configuration. Set JELLYFIN_URL and JELLYFIN_API_KEY in .env.')
    return
  }

  if (!JELLYFIN_URL.trim() && JELLYFIN_SERVER.trim()) {
    void logEvent(
      'warn',
      'config.deprecated',
      'JELLYFIN_SERVER is deprecated; rename it to JELLYFIN_URL'
    )
  }

  await prepareStorage(config)
  await restoreJobs()
  void probeJellyfin()
  void inspectFfmpeg()
  void logEvent(
    'warn',
    'security.no_auth',
    'No built-in authentication; run behind a reverse proxy or VPN'
  )

  const globals = globalThis as Record<symbol, unknown>
  if (!globals[SHUTDOWN_KEY]) {
    globals[SHUTDOWN_KEY] = true
    process.on('sveltekit:shutdown', () => {
      void logEvent('info', 'server.shutdown', 'Server shutting down')
    })
  }
}

/** Prints the startup banner and runs the boot checks once per process. */
export function start(): void {
  const globals = globalThis as Record<symbol, unknown>
  if (globals[START_KEY]) return
  globals[START_KEY] = true
  void run()
}
