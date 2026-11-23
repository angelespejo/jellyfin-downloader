import { defineEnvVars } from '@sveltejs/kit/env'

const optional = (value: string | undefined): string => value ?? ''

export const variables = defineEnvVars({
  JELLYFIN_URL: {
    description: 'Jellyfin server base URL (server only)',
    schema: optional,
  },
  JELLYFIN_SERVER: {
    description: 'Deprecated alias of JELLYFIN_URL (server only)',
    schema: optional,
  },
  JELLYFIN_PUBLIC_URL: {
    description: 'Public Jellyfin URL used by browser redirects (optional)',
    schema: optional,
  },
  JELLYFIN_API_KEY: {
    description: 'Jellyfin API key (server only)',
    schema: optional,
  },
  FFMPEG_PATH: {
    description: 'Optional path to the ffmpeg binary',
    schema: optional,
  },
  FFMPEG_CANDIDATES: {
    description: 'Extra ffmpeg candidate paths separated by the system delimiter',
    schema: optional,
  },
  FFMPEG_HWACCEL: {
    description: 'Hardware acceleration mode: auto, none, videotoolbox, nvenc, qsv or vaapi',
    schema: optional,
  },
  FFMPEG_VAAPI_DEVICE: {
    description: 'VAAPI/QSV render device (default /dev/dri/renderD128)',
    schema: optional,
  },
  SERVER_LOCAL_DOWNLOADS_ENABLED: {
    description: 'Enable the reusable local downloads store',
    schema: optional,
  },
  SERVER_LOCAL_DOWNLOADS_DIR: {
    description: 'Local downloads directory',
    schema: optional,
  },
  SERVER_LOCAL_DOWNLOADS_MAX_GB: {
    description: 'Optional local store size limit in GB (0 = unlimited)',
    schema: optional,
  },
  SERVER_LOCAL_DOWNLOADS_TTL_DAYS: {
    description: 'Optional local store TTL in days (0 = no expiry)',
    schema: optional,
  },
  SERVER_SETTINGS_FILE: {
    description: 'Global JSON configuration file editable from the UI',
    schema: optional,
  },
  SERVER_JOBS_DIR: {
    description: 'Persistent directory for job state',
    schema: optional,
  },
  SERVER_LOGS_DIR: {
    description: 'Directory for persisted application logs',
    schema: optional,
  },
  SERVER_LOGS_RETENTION_DAYS: {
    description: 'Number of days to keep application logs (0 = no automatic deletion)',
    schema: optional,
  },
  API_CORS_ORIGINS: {
    description: 'Allowed CORS origins, comma-separated (empty = same origin)',
    schema: optional,
  },
})
