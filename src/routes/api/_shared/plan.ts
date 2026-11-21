import { createHash } from 'node:crypto'
import {
  AUDIO_CODEC_VALUES,
  CONTAINER_VALUES,
  QUALITY_VALUES,
  SUBTITLE_PACKAGING_VALUES,
  SUBTITLE_STRATEGY_VALUES,
  VIDEO_CODEC_VALUES,
  type AudioCodec,
  type AudioPackaging,
  type Container,
  type ContainerOption,
  type DownloadOptionsInput,
  type DownloadConfig,
  type HardwareMode,
  type PresetOptions,
  type Quality,
  type SettingsDefaults,
  type SubtitlePackaging,
  type SubtitleStrategy,
  type TrackSelection,
  type VideoCodec,
} from '#lib/types.js'
import type { JellyfinItem } from './jellyfin-types.js'
import type { HardwareRuntime } from './hardware.js'
import {
  audioOrdinal,
  defaultContainerFor,
  embeddedSubtitleOrdinal,
  mediaDisplayTitle,
  sourceFingerprint,
  sourceMaxHeight,
  type InternalMediaSource,
  type InternalSubtitleStream,
} from './media.js'
import { containerExtension, sanitizeFilenamePart } from './files.js'

export const PLAN_SCHEMA_VERSION = 1

export class PlanError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(message: string, code = 'INVALID_OPTIONS', status = 400, details?: unknown) {
    super(message)
    this.name = 'PlanError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export interface PlanAudio {
  index: number
  ordinal: number
  sourceCodec: string
  language: string | null
  title: string | null
  displayTitle: string | null
  channels: number | null
  isDefault: boolean
  isForced: boolean
  packaging: AudioPackaging
}

export interface PlanSubtitle {
  index: number
  ordinal: number | null
  sourceCodec: string
  outputFormat: string
  isExternal: boolean
  isText: boolean
  language: string | null
  title: string | null
  displayTitle: string | null
  isDefault: boolean
  isForced: boolean
  packaging: SubtitlePackaging
  deliveryUrl: string | null
}

export interface DownloadPlan {
  schemaVersion: number
  movieId: string
  movieTitle: string
  movieYear: number | null
  seriesId?: string | null
  presetId?: string | null
  presetName?: string | null
  config?: DownloadConfig | null
  sourceId: string
  sourceContainer: string
  sourceVideoCodec: string
  sourceFingerprint: string
  sourceSizeBytes: number | null
  runtimeTicks: number | null
  durationSeconds: number | null
  container: Container
  quality: Quality
  effectiveQuality: Quality
  targetHeight: number | null
  scaleHeight: number | null
  videoCodec: VideoCodec
  videoEncoder: string | null
  softwareVideoEncoder?: string | null
  videoPreset: string
  crf: number
  hardware: PlanHardware | null
  audioCodec: AudioCodec
  audioEncoder: string | null
  audioBitrate: string | null
  audioPackaging: AudioPackaging
  audio: PlanAudio[]
  subtitles: PlanSubtitle[]
  burnSubtitleIndex: number | null
  outputKind: 'file' | 'zip'
  expectedFiles: number
  downloadName: string
  cacheKey: string
}

export interface PlanHardware {
  mode: HardwareMode
  encoder: string
  device: string | null
}

export interface PlanEnvironment {
  ffmpegVersion: string
  encoders: readonly string[]
  filters: readonly string[]
  hardware?: HardwareRuntime | null
}

export interface BuildPlanInput {
  item: JellyfinItem
  source: InternalMediaSource
  options?: DownloadOptionsInput
  presetOptions?: PresetOptions
  preset?: { id: string; name: string } | null
  mediaSourceId?: string | null
  defaults: SettingsDefaults
  environment: PlanEnvironment
}

const VIDEO_ENCODERS: Record<Exclude<VideoCodec, 'copy'>, string[]> = {
  h264: ['libx264'],
  h265: ['libx265'],
  vp9: ['libvpx-vp9'],
  av1: ['libsvtav1', 'libaom-av1'],
}

const AUDIO_ENCODERS: Record<Exclude<AudioCodec, 'copy'>, string[]> = {
  aac: ['aac'],
  ac3: ['ac3'],
  eac3: ['eac3'],
  opus: ['libopus'],
  flac: ['flac'],
  mp3: ['libmp3lame'],
}

const MP4_AUDIO_COPY = new Set(['aac', 'ac3', 'eac3', 'mp3'])
const WEBM_AUDIO_COPY = new Set(['opus', 'vorbis'])
const MP4_VIDEO_COPY = new Set(['h264', 'avc', 'h265', 'hevc', 'av1'])
const WEBM_VIDEO_COPY = new Set(['vp8', 'vp9', 'av1'])

const QUALITY_HEIGHTS: Record<Exclude<Quality, 'original'>, number> = {
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
}

const QUALITY_CRF: Record<Quality, number> = {
  original: 20,
  '2160p': 18,
  '1440p': 19,
  '1080p': 20,
  '720p': 21,
  '480p': 22,
  '360p': 23,
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

function normalizeVideoCodecCodec(codec: string): string {
  const normalized = codec.toLowerCase()
  if (normalized === 'avc') return 'h264'
  if (normalized === 'hevc') return 'h265'
  return normalized
}

function encoderAvailable(encoders: readonly string[], names: string[]): string | null {
  const set = new Set(encoders)
  return names.find((name) => set.has(name)) ?? null
}

function requireEncoder(encoders: readonly string[], names: string[], label: string): void {
  if (!encoderAvailable(encoders, names)) {
    throw new PlanError(
      `El ffmpeg disponible no tiene un encoder para ${label}`,
      'ENCODER_UNAVAILABLE',
      422
    )
  }
}

function resolveContainer(value: ContainerOption | undefined, sourceContainer: string): Container {
  const requested = value ?? 'source'
  if (requested === 'source') return defaultContainerFor(sourceContainer)
  if (!isOneOf(CONTAINER_VALUES, requested)) {
    throw new PlanError('Invalid container')
  }
  return requested
}

function matchesLanguage(language: string | null, languages: string[]): boolean {
  if (!language) return languages.includes('und')
  return languages.some((candidate) => candidate.toLowerCase() === language.toLowerCase())
}

function selectTracks<
  T extends { index: number; language: string | null; isDefault: boolean; isForced: boolean },
>(
  streams: T[],
  selection: TrackSelection | undefined,
  explicit: number[] | undefined,
  kind: 'audio' | 'subtitle'
): T[] {
  if (explicit) {
    const unique = [...new Set(explicit)]
    for (const index of unique) {
      if (!Number.isInteger(index) || !streams.some((stream) => stream.index === index)) {
        throw new PlanError(`Invalid ${kind} track index: ${String(index)}`)
      }
    }
    return streams.filter((stream) => unique.includes(stream.index))
  }

  const effective = selection ?? 'all'
  if (effective === 'all') return [...streams]
  if (effective === 'none') return []
  if (effective === 'default') {
    if (kind === 'audio') {
      const defaults = streams.filter((stream) => stream.isDefault)
      return defaults.length ? defaults : streams.slice(0, 1)
    }
    const defaults = streams.filter((stream) => stream.isDefault || stream.isForced)
    return defaults
  }
  if (Array.isArray(effective.languages)) {
    return streams.filter((stream) => matchesLanguage(stream.language, effective.languages))
  }
  throw new PlanError('Invalid track selection')
}

function mergeOptions(
  defaults: SettingsDefaults,
  presetOptions: PresetOptions | undefined,
  options: DownloadOptionsInput | undefined
): DownloadOptionsInput {
  return {
    container: options?.container ?? presetOptions?.container ?? defaults.container,
    quality: options?.quality ?? presetOptions?.quality ?? defaults.quality,
    videoCodec: options?.videoCodec ?? presetOptions?.videoCodec ?? defaults.videoCodec,
    audioCodec: options?.audioCodec ?? presetOptions?.audioCodec ?? defaults.audioCodec,
    audioSelection:
      options?.audioSelection ?? presetOptions?.audioSelection ?? defaults.audioSelection,
    audioPackaging:
      options?.audioPackaging ?? presetOptions?.audioPackaging ?? defaults.audioPackaging,
    subtitleSelection:
      options?.subtitleSelection ?? presetOptions?.subtitleSelection ?? defaults.subtitleSelection,
    subtitleStrategy:
      options?.subtitleStrategy ?? presetOptions?.subtitleStrategy ?? defaults.subtitleStrategy,
    audioStreamIndices: options?.audioStreamIndices,
    subtitleStreamIndices: options?.subtitleStreamIndices,
    subtitlePackaging: options?.subtitlePackaging,
    hardwareAcceleration: options?.hardwareAcceleration,
  }
}

function validateVideo(input: {
  container: Container
  source: InternalMediaSource
  quality: Quality
  videoCodec: VideoCodec
  encoders: readonly string[]
  hardware: HardwareRuntime | null
  hardwareEnabled: boolean
}): {
  scaleHeight: number | null
  effectiveQuality: Quality
  crf: number
  targetHeight: number | null
  videoEncoder: string | null
  softwareEncoder: string | null
  hardware: PlanHardware | null
} {
  const { container, source, quality, videoCodec, encoders, hardware, hardwareEnabled } = input
  if (!isOneOf(QUALITY_VALUES, quality)) throw new PlanError('Invalid quality')
  if (!isOneOf(VIDEO_CODEC_VALUES, videoCodec)) throw new PlanError('Invalid video codec')

  const primary = source.video[0]
  if (!primary) throw new PlanError('The source has no video track', 'NO_VIDEO', 422)
  const sourceCodec = normalizeVideoCodecCodec(primary.codec)

  let targetHeight: number | null = null
  let scaleHeight: number | null = null
  let effectiveQuality: Quality = quality
  let videoEncoder: string | null = null
  let softwareEncoder: string | null = null
  let hardwarePlan: PlanHardware | null = null
  if (quality !== 'original') {
    targetHeight = QUALITY_HEIGHTS[quality]
    const sourceHeight = sourceMaxHeight(source)
    if (sourceHeight !== null && sourceHeight <= targetHeight) {
      effectiveQuality = 'original'
      scaleHeight = null
    } else {
      scaleHeight = targetHeight
    }
  }

  if (videoCodec === 'copy') {
    if (scaleHeight !== null) {
      throw new PlanError(
        'Reducing resolution requires re-encoding the video; choose H.264 or H.265',
        'COPY_CANNOT_SCALE',
        422
      )
    }
    if (container === 'mp4' && !MP4_VIDEO_COPY.has(sourceCodec)) {
      throw new PlanError(
        `Source video codec (${sourceCodec}) is not compatible with MP4; choose another container or re-encode`,
        'INCOMPATIBLE_VIDEO_COPY',
        422
      )
    }
    if (container === 'webm' && !WEBM_VIDEO_COPY.has(sourceCodec)) {
      throw new PlanError(
        `Source video codec (${sourceCodec}) is not compatible with WebM; choose another container or re-encode`,
        'INCOMPATIBLE_VIDEO_COPY',
        422
      )
    }
  } else {
    if (container === 'mp4' && !['h264', 'h265', 'av1'].includes(videoCodec)) {
      throw new PlanError(
        `Video codec ${videoCodec} is not compatible with MP4`,
        'INCOMPATIBLE_VIDEO_CODEC',
        422
      )
    }
    if (container === 'webm' && !['vp9', 'av1'].includes(videoCodec)) {
      throw new PlanError(
        `Video codec ${videoCodec} is not compatible with WebM`,
        'INCOMPATIBLE_VIDEO_CODEC',
        422
      )
    }
    requireEncoder(encoders, VIDEO_ENCODERS[videoCodec], `video ${videoCodec}`)
    softwareEncoder = encoderAvailable(encoders, VIDEO_ENCODERS[videoCodec])
    const hardwareEncoder =
      hardwareEnabled && videoCodec !== 'vp9'
        ? (hardware?.encoders[videoCodec as Exclude<VideoCodec, 'copy' | 'vp9'>] ?? null)
        : null
    if (hardware && hardwareEncoder) {
      videoEncoder = hardwareEncoder
      hardwarePlan = {
        mode: hardware.mode,
        encoder: hardwareEncoder,
        device: hardware.device,
      }
    } else {
      videoEncoder = softwareEncoder
    }
  }

  return {
    scaleHeight,
    effectiveQuality,
    crf: QUALITY_CRF[effectiveQuality],
    targetHeight,
    videoEncoder,
    softwareEncoder,
    hardware: hardwarePlan,
  }
}

function validateAudio(input: {
  container: Container
  audioCodec: AudioCodec
  audioPackaging: AudioPackaging
  tracks: PlanAudio[]
  encoders: readonly string[]
}): { bitrate: string | null; encoder: string | null } {
  const { container, audioCodec, audioPackaging, tracks, encoders } = input
  if (!isOneOf(AUDIO_CODEC_VALUES, audioCodec)) throw new PlanError('Invalid audio codec')
  if (!['mux', 'separate'].includes(audioPackaging)) throw new PlanError('Invalid audio packaging')

  let encoder: string | null = null
  if (audioCodec !== 'copy') {
    if (container === 'mp4' && !['aac', 'ac3', 'eac3', 'mp3'].includes(audioCodec)) {
      throw new PlanError(
        `Audio codec ${audioCodec} is not compatible with MP4`,
        'INCOMPATIBLE_AUDIO_CODEC',
        422
      )
    }
    if (container === 'webm' && audioCodec !== 'opus') {
      throw new PlanError(
        `Audio codec ${audioCodec} is not compatible with WebM`,
        'INCOMPATIBLE_AUDIO_CODEC',
        422
      )
    }
    requireEncoder(encoders, AUDIO_ENCODERS[audioCodec], `audio ${audioCodec}`)
    encoder = encoderAvailable(encoders, AUDIO_ENCODERS[audioCodec])
  }

  if (audioPackaging === 'mux' && audioCodec === 'copy') {
    for (const track of tracks) {
      const sourceCodec = track.sourceCodec.toLowerCase()
      if (container === 'mp4' && !MP4_AUDIO_COPY.has(sourceCodec)) {
        throw new PlanError(
          `Audio track ${sourceCodec} cannot be copied into MP4; choose AAC or another target codec`,
          'INCOMPATIBLE_AUDIO_COPY',
          422
        )
      }
      if (container === 'webm' && !WEBM_AUDIO_COPY.has(sourceCodec)) {
        throw new PlanError(
          `Audio track ${sourceCodec} cannot be copied into WebM; choose Opus`,
          'INCOMPATIBLE_AUDIO_COPY',
          422
        )
      }
    }
  }

  if (audioCodec === 'copy') return { bitrate: null, encoder: null }
  let bitrate: string | null = null
  switch (audioCodec) {
    case 'aac':
      bitrate = '192k'
      break
    case 'ac3':
    case 'eac3':
      bitrate = '384k'
      break
    case 'opus':
      bitrate = '160k'
      break
    case 'mp3':
      bitrate = '192k'
      break
    case 'flac':
      bitrate = null
      break
    default:
      bitrate = null
  }
  return { bitrate, encoder }
}

function subtitleOutputFormat(stream: InternalSubtitleStream): string {
  const format = stream.format.toLowerCase()
  if (stream.codec === 'mov_text') return 'srt'
  if (stream.codec === 'pgssub' || stream.codec === 'hdmv_pgs_subtitle') return 'sup'
  if (stream.codec === 'dvdsub' || stream.codec === 'dvb_subtitle') return 'sub'
  return format
}

function validateSubtitles(input: {
  container: Container
  strategy: SubtitleStrategy
  subtitles: PlanSubtitle[]
  videoCodec: VideoCodec
  overrides: Record<string, SubtitlePackaging> | undefined
  filters: readonly string[]
}): { burnSubtitleIndex: number | null; subtitles: PlanSubtitle[] } {
  const { container, strategy, videoCodec, overrides } = input
  if (!isOneOf(SUBTITLE_STRATEGY_VALUES, strategy)) {
    throw new PlanError('Invalid subtitle strategy')
  }

  let selected = strategy === 'none' ? [] : input.subtitles
  if (selected.length === 0) return { burnSubtitleIndex: null, subtitles: [] }

  if (strategy === 'burn' && selected.length !== 1) {
    throw new PlanError('Burn mode requires exactly one subtitle', 'BURN_ONE_ONLY', 422)
  }

  const overrideMap = new Map<number, SubtitlePackaging>()
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      const index = Number(key)
      if (!Number.isInteger(index)) throw new PlanError('Invalid subtitle override')
      if (!isOneOf(SUBTITLE_PACKAGING_VALUES, value)) {
        throw new PlanError('Invalid subtitle packaging')
      }
      if (!selected.some((subtitle) => subtitle.index === index)) {
        throw new PlanError(`Subtitle override ${index} does not match a selected track`)
      }
      overrideMap.set(index, value)
    }
  }

  const mapped = selected.map((subtitle) => {
    let packaging: SubtitlePackaging
    if (overrideMap.has(subtitle.index)) {
      packaging = overrideMap.get(subtitle.index) as SubtitlePackaging
    } else if (strategy === 'mirror-source') {
      packaging = subtitle.isExternal ? 'separate' : 'mux'
    } else if (strategy === 'muxed') {
      packaging = 'mux'
    } else if (strategy === 'separate') {
      packaging = 'separate'
    } else if (strategy === 'burn') {
      packaging = 'burn'
    } else {
      packaging = 'separate'
    }
    return { ...subtitle, packaging }
  })

  const burn = mapped.filter((subtitle) => subtitle.packaging === 'burn')
  if (burn.length > 1) {
    throw new PlanError('Only one subtitle can be burned per download', 'BURN_ONE_ONLY', 422)
  }
  if (burn.length === 1 && !burn[0].isText) {
    throw new PlanError(
      'The selected subtitle is a bitmap (PGS/VobSub); use integrated or separate',
      'BURN_BITMAP_UNSUPPORTED',
      422
    )
  }
  if (burn.length === 1 && videoCodec === 'copy') {
    throw new PlanError(
      'Burning subtitles requires re-encoding the video; choose H.264 or H.265',
      'BURN_REQUIRES_ENCODE',
      422
    )
  }
  if (burn.length === 1 && !input.filters.includes('subtitles')) {
    throw new PlanError(
      'This ffmpeg build does not include the "subtitles" filter (libass); burning is unavailable. Use integrated or separate subtitles.',
      'BURN_UNSUPPORTED',
      422
    )
  }

  for (const subtitle of mapped) {
    if (subtitle.packaging !== 'mux') continue
    if ((container === 'mp4' || container === 'webm') && !subtitle.isText) {
      throw new PlanError(
        `Subtitle ${subtitle.sourceCodec} cannot be integrated into ${container.toUpperCase()}; separate it or use MKV`,
        'INCOMPATIBLE_SUBTITLE',
        422
      )
    }
  }

  return {
    burnSubtitleIndex: burn[0]?.index ?? null,
    subtitles: mapped,
  }
}

function buildDownloadName(input: {
  title: string
  year: number | null
  presetLabel: string
  container: Container
  outputKind: 'file' | 'zip'
}): string {
  const title = sanitizeFilenamePart(input.title || 'Movie', 100)
  const year = input.year ? ` (${input.year})` : ''
  const preset = sanitizeFilenamePart(input.presetLabel || 'custom', 60)
  const extension = input.outputKind === 'zip' ? 'zip' : containerExtension(input.container)
  return sanitizeFilenamePart(`${title}${year} - ${preset}.${extension}`, 180)
}

export function buildPlan(input: BuildPlanInput): DownloadPlan {
  const { item, source, defaults, environment } = input
  const options = mergeOptions(defaults, input.presetOptions, input.options)

  const container = resolveContainer(options.container, source.container)
  const quality = options.quality ?? 'original'
  const videoCodec = options.videoCodec ?? 'copy'
  const video = validateVideo({
    container,
    source,
    quality,
    videoCodec,
    encoders: environment.encoders,
    hardware: environment.hardware ?? null,
    hardwareEnabled: options.hardwareAcceleration !== false,
  })

  const selectedAudioStreams = selectTracks(
    source.audio,
    options.audioSelection,
    options.audioStreamIndices,
    'audio'
  )
  const audioPackaging = options.audioPackaging ?? 'mux'
  if (!['mux', 'separate'].includes(audioPackaging)) throw new PlanError('Invalid audio packaging')

  const audio: PlanAudio[] = selectedAudioStreams.map((stream) => {
    const ordinal = audioOrdinal(source, stream.index)
    if (ordinal < 0) throw new PlanError('Pista de audio no encontrada en la fuente')
    return {
      index: stream.index,
      ordinal,
      sourceCodec: stream.codec,
      language: stream.language,
      title: stream.title,
      displayTitle: stream.displayTitle,
      channels: stream.channels,
      isDefault: stream.isDefault,
      isForced: stream.isForced,
      packaging: audioPackaging,
    }
  })

  const audioCodec = options.audioCodec ?? 'copy'
  const audioValidation = validateAudio({
    container,
    audioCodec,
    audioPackaging,
    tracks: audio,
    encoders: environment.encoders,
  })
  const audioBitrate = audioValidation.bitrate

  const selectedSubtitleStreams = selectTracks(
    source.subtitles,
    options.subtitleSelection,
    options.subtitleStreamIndices,
    'subtitle'
  )

  const candidateSubtitles: PlanSubtitle[] = selectedSubtitleStreams.map((stream) => {
    const ordinal = stream.isExternal ? null : embeddedSubtitleOrdinal(source, stream.index)
    if (!stream.isExternal && (ordinal === null || ordinal < 0)) {
      throw new PlanError('Embedded subtitle not found in source')
    }
    return {
      index: stream.index,
      ordinal,
      sourceCodec: stream.codec,
      outputFormat: subtitleOutputFormat(stream),
      isExternal: stream.isExternal,
      isText: stream.isText,
      language: stream.language,
      title: stream.title,
      displayTitle: stream.displayTitle,
      isDefault: stream.isDefault,
      isForced: stream.isForced,
      packaging: 'mux',
      deliveryUrl: stream.deliveryUrl,
    }
  })

  const subtitleValidation = validateSubtitles({
    container,
    strategy: options.subtitleStrategy ?? 'mirror-source',
    subtitles: candidateSubtitles,
    videoCodec,
    overrides: options.subtitlePackaging,
    filters: environment.filters,
  })
  const subtitles = subtitleValidation.subtitles

  const separateAudio = audioPackaging === 'separate' ? audio.length : 0
  const separateSubtitles = subtitles.filter((subtitle) => subtitle.packaging === 'separate').length
  const expectedFiles = 1 + separateAudio + separateSubtitles
  const outputKind: 'file' | 'zip' = expectedFiles > 1 ? 'zip' : 'file'

  const downloadName = buildDownloadName({
    title: mediaDisplayTitle(item),
    year: item.ProductionYear ?? null,
    presetLabel: input.preset?.name ?? 'custom',
    container,
    outputKind,
  })

  const downloadConfig: DownloadConfig = {
    presetId: input.preset?.id ?? null,
    presetName: input.preset?.name ?? null,
    mediaSourceId: input.mediaSourceId ?? source.id,
    options,
  }

  const keyPayload = {
    schema: PLAN_SCHEMA_VERSION,
    ffmpeg: environment.ffmpegVersion,
    movieId: item.Id,
    sourceId: source.id,
    sourceFingerprint: sourceFingerprint(source),
    sourceVideoCodec: source.video[0]?.codec ?? 'desconocido',
    container,
    quality: video.effectiveQuality,
    scaleHeight: video.scaleHeight,
    videoCodec,
    videoEncoder: video.softwareEncoder,
    crf: video.crf,
    preset: 'medium',
    audioCodec,
    audioEncoder: audioValidation.encoder,
    audioBitrate,
    audioPackaging,
    audio: audio.map((track) => ({
      index: track.index,
      codec: track.sourceCodec,
      packaging: track.packaging,
      language: track.language,
      title: track.title,
      isDefault: track.isDefault,
      isForced: track.isForced,
    })),
    subtitles: subtitles.map((subtitle) => ({
      index: subtitle.index,
      codec: subtitle.sourceCodec,
      external: subtitle.isExternal,
      packaging: subtitle.packaging,
      outputFormat: subtitle.outputFormat,
      language: subtitle.language,
      title: subtitle.title,
      isDefault: subtitle.isDefault,
      isForced: subtitle.isForced,
    })),
    burn: subtitleValidation.burnSubtitleIndex,
    downloadName,
    presetId: input.preset?.id ?? null,
  }

  const cacheKey = createHash('sha256').update(JSON.stringify(keyPayload)).digest('hex')

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    movieId: item.Id,
    movieTitle: mediaDisplayTitle(item),
    movieYear: item.ProductionYear ?? null,
    seriesId: item.SeriesId ?? null,
    presetId: downloadConfig.presetId,
    presetName: downloadConfig.presetName,
    config: downloadConfig,
    sourceId: source.id,
    sourceContainer: source.container,
    sourceVideoCodec: source.video[0]?.codec ?? 'desconocido',
    sourceFingerprint: sourceFingerprint(source),
    sourceSizeBytes: source.sizeBytes,
    runtimeTicks: source.runtimeTicks,
    durationSeconds: source.runtimeTicks ? source.runtimeTicks / 10_000_000 : null,
    container,
    quality,
    effectiveQuality: video.effectiveQuality,
    targetHeight: video.targetHeight,
    scaleHeight: video.scaleHeight,
    videoCodec,
    videoEncoder: video.videoEncoder,
    softwareVideoEncoder: video.softwareEncoder,
    videoPreset: 'medium',
    crf: video.crf,
    hardware: video.hardware,
    audioCodec,
    audioEncoder: audioValidation.encoder,
    audioBitrate,
    audioPackaging,
    audio,
    subtitles,
    burnSubtitleIndex: subtitleValidation.burnSubtitleIndex,
    outputKind,
    expectedFiles,
    downloadName,
    cacheKey,
  }
}

export function disableHardwareInPlan(plan: DownloadPlan): DownloadPlan {
  if (!plan.hardware) return plan
  return {
    ...plan,
    hardware: null,
    videoEncoder: plan.softwareVideoEncoder ?? plan.videoEncoder,
  }
}

export function planToPublicSummary(plan: DownloadPlan): {
  outputKind: 'file' | 'zip'
  expectedFiles: number
  filename: string
  container: Container
  quality: Quality
  audioTracks: number
  subtitles: number
} {
  return {
    outputKind: plan.outputKind,
    expectedFiles: plan.expectedFiles,
    filename: plan.downloadName,
    container: plan.container,
    quality: plan.effectiveQuality,
    audioTracks: plan.audio.length,
    subtitles: plan.subtitles.length,
  }
}
