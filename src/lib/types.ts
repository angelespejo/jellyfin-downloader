export const LOCALES = ['en', 'es', 'ca'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_MODES = ['auto', 'en', 'es', 'ca'] as const
export type LocaleMode = (typeof LOCALE_MODES)[number]

export const THEME_MODES = ['system', 'light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export const CONTAINER_VALUES = ['source', 'mkv', 'mp4', 'webm'] as const
export type ContainerOption = (typeof CONTAINER_VALUES)[number]
export const CONTAINERS = ['mkv', 'mp4', 'webm'] as const
export type Container = (typeof CONTAINERS)[number]

export const QUALITY_VALUES = [
  'original',
  '2160p',
  '1440p',
  '1080p',
  '720p',
  '480p',
  '360p',
] as const
export type Quality = (typeof QUALITY_VALUES)[number]

export const VIDEO_CODEC_VALUES = ['copy', 'h264', 'h265', 'vp9', 'av1'] as const
export type VideoCodec = (typeof VIDEO_CODEC_VALUES)[number]

export const AUDIO_CODEC_VALUES = ['copy', 'aac', 'ac3', 'eac3', 'opus', 'flac', 'mp3'] as const
export type AudioCodec = (typeof AUDIO_CODEC_VALUES)[number]

export const AUDIO_PACKAGING_VALUES = ['mux', 'separate'] as const
export type AudioPackaging = (typeof AUDIO_PACKAGING_VALUES)[number]

export const SUBTITLE_PACKAGING_VALUES = ['mux', 'separate', 'burn'] as const
export type SubtitlePackaging = (typeof SUBTITLE_PACKAGING_VALUES)[number]

export const SUBTITLE_STRATEGY_VALUES = [
  'mirror-source',
  'muxed',
  'separate',
  'burn',
  'none',
] as const
export type SubtitleStrategy = (typeof SUBTITLE_STRATEGY_VALUES)[number]

export type TrackSelection = 'all' | 'default' | 'none' | { languages: string[] }

export type MediaKind = 'movie' | 'series' | 'episode' | 'homevideo'

export const HARDWARE_MODES = ['videotoolbox', 'nvenc', 'qsv', 'vaapi'] as const
export type HardwareMode = (typeof HARDWARE_MODES)[number]

export interface HardwareCapabilities {
  available: boolean
  mode: HardwareMode | null
  codecs: VideoCodec[]
}

export interface DownloadOptionsInput {
  container?: ContainerOption
  quality?: Quality
  videoCodec?: VideoCodec
  audioCodec?: AudioCodec
  audioSelection?: TrackSelection
  audioStreamIndices?: number[]
  audioPackaging?: AudioPackaging
  subtitleSelection?: TrackSelection
  subtitleStreamIndices?: number[]
  subtitleStrategy?: SubtitleStrategy
  /** Overrides per Jellyfin subtitle stream index. JSON object keys are strings. */
  subtitlePackaging?: Record<string, SubtitlePackaging>
  /** When false, the plan avoids the hardware encoder even if one is available. */
  hardwareAcceleration?: boolean
}

export type PresetOptions = Omit<
  DownloadOptionsInput,
  'audioStreamIndices' | 'subtitleStreamIndices' | 'subtitlePackaging' | 'hardwareAcceleration'
>

export interface SettingsDefaults {
  container: ContainerOption
  quality: Quality
  videoCodec: VideoCodec
  audioCodec: AudioCodec
  audioSelection: TrackSelection
  audioPackaging: AudioPackaging
  subtitleSelection: TrackSelection
  subtitleStrategy: SubtitleStrategy
}

export interface Preset {
  id: string
  name: string
  description?: string
  tags: string[]
  options: PresetOptions
}

export interface SettingsDocument {
  schemaVersion: 1
  revision: number
  updatedAt: string
  defaults: SettingsDefaults
  presets: Preset[]
}

export interface MediaSummary {
  maxHeight: number | null
  container: string
  videoCodec: string | null
  audioLanguages: string[]
  subtitleCount: number
  sizeBytes: number | null
}

export interface MovieSummary {
  id: string
  title: string
  year: number | null
  runtimeSeconds: number | null
  imageTag: string | null
  media: MediaSummary | null
  downloadCount: number
  kind?: MediaKind
  seriesId?: string | null
  seriesName?: string | null
  seasonNumber?: number | null
  episodeNumber?: number | null
  episodeCount?: number
}

export interface VideoStreamInfo {
  index: number
  codec: string
  width: number | null
  height: number | null
  bitrate: number | null
  isDefault: boolean
  title: string | null
  language: string | null
}

export interface AudioStreamInfo {
  index: number
  codec: string
  channels: number | null
  bitrate: number | null
  language: string | null
  title: string | null
  displayTitle: string | null
  isDefault: boolean
  isForced: boolean
}

export interface SubtitleStreamInfo {
  index: number
  codec: string
  format: string
  isExternal: boolean
  isText: boolean
  language: string | null
  title: string | null
  displayTitle: string | null
  isDefault: boolean
  isForced: boolean
}

export interface MediaSourceInfo {
  id: string
  name: string
  container: string
  sizeBytes: number | null
  bitrate: number | null
  runtimeTicks: number | null
  video: VideoStreamInfo[]
  audio: AudioStreamInfo[]
  subtitles: SubtitleStreamInfo[]
}

export interface MovieDetail {
  id: string
  title: string
  year: number | null
  runtimeSeconds: number | null
  overview: string | null
  imageTag: string | null
  defaultContainer: Container
  sources: MediaSourceInfo[]
  kind?: MediaKind
  seriesId?: string | null
  seriesName?: string | null
  seasonNumber?: number | null
  episodeNumber?: number | null
}

export interface SeriesDetail {
  id: string
  title: string
  year: number | null
  overview: string | null
  imageTag: string | null
  kind: 'series'
  totalSizeBytes: number | null
  unavailableEpisodes: number
  episodes: MovieSummary[]
}

export interface Capabilities {
  ffmpeg: {
    available: boolean
    version: string | null
  }
  hardware: HardwareCapabilities
  burnIn: boolean
  containers: Container[]
  videoCodecs: Record<Container, VideoCodec[]>
  audioCodecs: Record<Container, AudioCodec[]>
  maxConcurrentJobs: number
  maxQueuedJobs: number
  localDownloads: {
    enabled: boolean
  }
}

export interface CreateDownloadRequest {
  movieId: string
  mediaSourceId?: string
  preset?: string
  options?: DownloadOptionsInput
}

export interface LocalDownloadsCheckRequest {
  movieId: string
  mediaSourceId?: string
  preset?: string
  options?: DownloadOptionsInput
}

export interface LocalDownloadInfo {
  key: string
  filename: string
  sizeBytes: number
  sourceSizeBytes: number | null
  processingMs: number | null
  createdAt: string
  kind: 'file' | 'zip'
  movieId: string | null
  seriesId: string | null
  movieTitle: string | null
  movieYear: number | null
  downloadUrl: string
  config: DownloadConfig | null
}

export interface DownloadConfig {
  presetId: string | null
  presetName: string | null
  mediaSourceId: string | null
  options: DownloadOptionsInput
}

export interface CreateBatchDownloadRequest {
  movieIds: string[]
  mediaSourceId?: string
  preset?: string
  options?: DownloadOptionsInput
}

export interface BatchDownloadError {
  movieId: string
  code: string
  message: string
}

export interface BatchDownloadResult {
  jobs: DownloadJobStatus[]
  errors: BatchDownloadError[]
}

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  event: string
  message: string
  context: Record<string, string | number | boolean | null>
}

export interface LogsResponse {
  entries: LogEntry[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
  date: string | null
  retentionDays: number
}

export interface LocalDownloadsCheckResult {
  enabled: boolean
  hit: boolean
  key?: string
  sizeBytes?: number
  createdAt?: string
  filename?: string
  kind?: 'file' | 'zip'
}

export type JobState = 'queued' | 'running' | 'ready' | 'failed' | 'cancelled'

export type JobStage =
  | 'queued'
  | 'preparing'
  | 'downloading-source'
  | 'downloading-subtitles'
  | 'processing-video'
  | 'extracting-audio'
  | 'extracting-subtitles'
  | 'packaging'
  | 'finalizing'
  | 'ready'

export interface JobOutput {
  kind: 'file' | 'zip'
  filename: string
  sizeBytes: number
  downloadUrl: string
}

export interface DownloadJobStatus {
  id: string
  title: string
  filename: string
  movieId: string
  seriesId: string | null
  sourceSizeBytes: number | null
  processingMs: number
  config: DownloadConfig | null
  state: JobState
  stage: JobStage
  progress: number | null
  queuePosition: number | null
  cached: boolean
  stored: boolean
  expectedFiles: number
  output: JobOutput | null
  error: string | null
  errorCode: string | null
  createdAt: string
  updatedAt: string
}

export interface DownloadQueueResponse {
  jobs: DownloadJobStatus[]
  total: number
  active: number
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export interface ArtworkSize {
  width: 160 | 300 | 600
}

export type IconName =
  | 'search'
  | 'settings'
  | 'download'
  | 'folder'
  | 'edit'
  | 'trash'
  | 'close'
  | 'plus'
  | 'globe'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'info'
  | 'check'
  | 'film'
  | 'api'
  | 'play'
  | 'clock'

export interface TabItem {
  id: string
  label: string
  icon?: IconName
}
