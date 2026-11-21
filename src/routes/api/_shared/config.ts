import path from 'node:path'
import {
  API_CORS_ORIGINS,
  FFMPEG_CANDIDATES,
  FFMPEG_HWACCEL,
  FFMPEG_PATH,
  FFMPEG_VAAPI_DEVICE,
  JELLYFIN_API_KEY,
  JELLYFIN_SERVER,
  SERVER_LOCAL_DOWNLOADS_DIR,
  SERVER_LOCAL_DOWNLOADS_ENABLED,
  SERVER_LOCAL_DOWNLOADS_MAX_GB,
  SERVER_LOCAL_DOWNLOADS_TTL_DAYS,
  SERVER_LOGS_DIR,
  SERVER_LOGS_RETENTION_DAYS,
  SERVER_SETTINGS_FILE,
  SERVER_JOBS_DIR,
} from '$app/env/private'
import { HARDWARE_MODES, type HardwareMode } from '#lib/types.js'

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export interface ServerConfig {
  jellyfinServer: string
  jellyfinApiKey: string
  ffmpegPath: string
  ffmpegCandidates: string[]
  ffmpegHwaccel: 'auto' | 'none' | HardwareMode
  ffmpegVaapiDevice: string
  localDownloadsEnabled: boolean
  localDownloadsDir: string
  localDownloadsMaxBytes: number
  localDownloadsTtlMs: number
  settingsFile: string
  jobsDir: string
  logsDir: string
  logsRetentionDays: number
  corsOrigins: string[]
  maxConcurrentJobs: number
  maxQueuedJobs: number
}

let cached: ServerConfig | null = null

function parseNonNegativeNumber(value: string, name: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ConfigError(`${name} must be a number greater than or equal to 0`)
  }
  return parsed
}

function parseBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function parseHardwareAcceleration(value: string): 'auto' | 'none' | HardwareMode {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return 'auto'
  if (normalized === 'auto' || normalized === 'none') return normalized
  if ((HARDWARE_MODES as readonly string[]).includes(normalized)) {
    return normalized as HardwareMode
  }
  throw new ConfigError(`FFMPEG_HWACCEL must be auto, none or one of: ${HARDWARE_MODES.join(', ')}`)
}

function resolveSafePath(value: string, fallback: string, name: string): string {
  const raw = value.trim() || fallback
  const resolved = path.resolve(process.cwd(), raw)
  if (resolved === path.parse(resolved).root) {
    throw new ConfigError(`${name} cannot be the filesystem root`)
  }
  return resolved
}

function normalizeJellyfinServer(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new ConfigError('JELLYFIN_SERVER is required')
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new ConfigError('JELLYFIN_SERVER is not a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError('JELLYFIN_SERVER must use http or https')
  }
  if (url.username || url.password) {
    throw new ConfigError('JELLYFIN_SERVER must not include credentials in the URL')
  }
  return url.toString().replace(/\/+$/, '')
}

function validateApiKey(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new ConfigError('JELLYFIN_API_KEY is required')
  }
  if (/[\r\n"\\]/.test(trimmed)) {
    throw new ConfigError('JELLYFIN_API_KEY contains invalid characters')
  }
  return trimmed
}

export function getConfig(): ServerConfig {
  if (cached) return cached

  const localDownloadsEnabled = parseBoolean(SERVER_LOCAL_DOWNLOADS_ENABLED)
  const maxGb = parseNonNegativeNumber(
    SERVER_LOCAL_DOWNLOADS_MAX_GB,
    'SERVER_LOCAL_DOWNLOADS_MAX_GB'
  )
  const ttlDays = parseNonNegativeNumber(
    SERVER_LOCAL_DOWNLOADS_TTL_DAYS,
    'SERVER_LOCAL_DOWNLOADS_TTL_DAYS'
  )
  const logsRetentionDays = SERVER_LOGS_RETENTION_DAYS.trim()
    ? parseNonNegativeNumber(SERVER_LOGS_RETENTION_DAYS, 'SERVER_LOGS_RETENTION_DAYS')
    : 14

  cached = {
    jellyfinServer: normalizeJellyfinServer(JELLYFIN_SERVER),
    jellyfinApiKey: validateApiKey(JELLYFIN_API_KEY),
    ffmpegPath: FFMPEG_PATH.trim(),
    ffmpegCandidates: FFMPEG_CANDIDATES.split(path.delimiter)
      .map((item) => item.trim())
      .filter(Boolean),
    ffmpegHwaccel: parseHardwareAcceleration(FFMPEG_HWACCEL),
    ffmpegVaapiDevice: FFMPEG_VAAPI_DEVICE.trim() || '/dev/dri/renderD128',
    localDownloadsEnabled,
    localDownloadsDir: resolveSafePath(
      SERVER_LOCAL_DOWNLOADS_DIR,
      './data/downloads',
      'SERVER_LOCAL_DOWNLOADS_DIR'
    ),
    localDownloadsMaxBytes: Math.floor(maxGb * 1024 ** 3),
    localDownloadsTtlMs: Math.floor(ttlDays * 24 * 60 * 60 * 1000),
    settingsFile: resolveSafePath(
      SERVER_SETTINGS_FILE,
      './data/settings.json',
      'SERVER_SETTINGS_FILE'
    ),
    jobsDir: resolveSafePath(SERVER_JOBS_DIR, './data/jobs', 'SERVER_JOBS_DIR'),
    logsDir: resolveSafePath(SERVER_LOGS_DIR, './data/logs', 'SERVER_LOGS_DIR'),
    logsRetentionDays,
    corsOrigins: API_CORS_ORIGINS.split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    maxConcurrentJobs: 1,
    maxQueuedJobs: 20,
  }

  return cached
}

export function resetConfigForTests(): void {
  cached = null
}
