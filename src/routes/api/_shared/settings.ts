import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, readFile, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  AUDIO_CODEC_VALUES,
  AUDIO_PACKAGING_VALUES,
  CONTAINER_VALUES,
  QUALITY_VALUES,
  SUBTITLE_STRATEGY_VALUES,
  VIDEO_CODEC_VALUES,
  type Preset,
  type PresetOptions,
  type SettingsDefaults,
  type SettingsDocument,
  type TrackSelection,
} from '#lib/types.js'
import { DEFAULT_PRESET_TAG, normalizePresetTags, PresetTagError } from '#lib/presets.js'
import { getConfig } from './config.js'

export class SettingsValidationError extends Error {
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = 'SettingsValidationError'
    this.details = details
  }
}

export class SettingsConflictError extends Error {
  constructor() {
    super('The configuration was changed by another session; reload before saving')
    this.name = 'SettingsConflictError'
  }
}

const DEFAULT_SETTINGS: SettingsDocument = {
  schemaVersion: 1,
  revision: 1,
  updatedAt: new Date(0).toISOString(),
  defaults: {
    container: 'source',
    quality: 'original',
    videoCodec: 'copy',
    audioCodec: 'copy',
    audioSelection: 'all',
    audioPackaging: 'mux',
    subtitleSelection: 'all',
    subtitleStrategy: 'mirror-source',
  },
  presets: [
    {
      id: 'original',
      name: 'Original',
      description: 'Keep the source quality and codecs, mirroring the subtitle layout.',
      tags: [DEFAULT_PRESET_TAG],
      options: {
        container: 'source',
        quality: 'original',
        videoCodec: 'copy',
        audioCodec: 'copy',
        audioSelection: 'all',
        audioPackaging: 'mux',
        subtitleSelection: 'all',
        subtitleStrategy: 'mirror-source',
      },
    },
    {
      id: 'mp4-1080p',
      name: 'MP4 1080p',
      description: 'H.264 video and AAC audio up to 1080p with integrated subtitles.',
      tags: [DEFAULT_PRESET_TAG],
      options: {
        container: 'mp4',
        quality: '1080p',
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioSelection: 'all',
        audioPackaging: 'mux',
        subtitleSelection: 'all',
        subtitleStrategy: 'muxed',
      },
    },
    {
      id: 'mp4-720p',
      name: 'MP4 720p',
      description: 'H.264 video and AAC audio up to 720p with integrated subtitles.',
      tags: [DEFAULT_PRESET_TAG],
      options: {
        container: 'mp4',
        quality: '720p',
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioSelection: 'all',
        audioPackaging: 'mux',
        subtitleSelection: 'all',
        subtitleStrategy: 'muxed',
      },
    },
    {
      id: 'mp4-480p',
      name: 'MP4 480p',
      description: 'H.264 video and AAC audio up to 480p with integrated subtitles.',
      tags: [DEFAULT_PRESET_TAG],
      options: {
        container: 'mp4',
        quality: '480p',
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioSelection: 'all',
        audioPackaging: 'mux',
        subtitleSelection: 'all',
        subtitleStrategy: 'muxed',
      },
    },
    {
      id: 'mp4-360p',
      name: 'MP4 360p',
      description: 'H.264 video and AAC audio up to 360p with integrated subtitles.',
      tags: [DEFAULT_PRESET_TAG],
      options: {
        container: 'mp4',
        quality: '360p',
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioSelection: 'all',
        audioPackaging: 'mux',
        subtitleSelection: 'all',
        subtitleStrategy: 'muxed',
      },
    },
  ],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const LEGACY_FACTORY_PRESET = {
  id: 'mp4-480p',
  name: 'MP4 480p — todo en uno',
  description: 'H.264 video, AAC audio and integrated subtitles in a single MP4.',
  tags: [DEFAULT_PRESET_TAG],
  options: {
    container: 'mp4',
    quality: '480p',
    videoCodec: 'h264',
    audioCodec: 'aac',
    audioSelection: 'all',
    audioPackaging: 'mux',
    subtitleSelection: 'all',
    subtitleStrategy: 'muxed',
  },
} as const

function isLegacyFactorySettings(document: SettingsDocument): boolean {
  return (
    document.presets.length === 1 &&
    JSON.stringify(document.presets[0]) === JSON.stringify(LEGACY_FACTORY_PRESET)
  )
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

function assertOnlyKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new SettingsValidationError(`${label}: unknown field "${key}"`)
  }
}

function validateSelection(value: unknown, label: string): TrackSelection {
  if (value === 'all' || value === 'default' || value === 'none') return value
  if (isRecord(value) && Array.isArray(value.languages)) {
    assertOnlyKeys(value, ['languages'], label)
    const languages = value.languages.map((language) => {
      if (typeof language !== 'string' || !/^[a-zA-Z]{2,3}$/.test(language)) {
        throw new SettingsValidationError(`${label}: invalid language`)
      }
      return language.toLowerCase()
    })
    return { languages }
  }
  throw new SettingsValidationError(`${label}: invalid selection`)
}

function validateDefaults(value: unknown): SettingsDefaults {
  if (!isRecord(value)) throw new SettingsValidationError('defaults debe ser un objeto')
  assertOnlyKeys(
    value,
    [
      'container',
      'quality',
      'videoCodec',
      'audioCodec',
      'audioSelection',
      'audioPackaging',
      'subtitleSelection',
      'subtitleStrategy',
    ],
    'defaults'
  )
  if (!isOneOf(CONTAINER_VALUES, value.container)) {
    throw new SettingsValidationError('invalid defaults.container')
  }
  if (!isOneOf(QUALITY_VALUES, value.quality)) {
    throw new SettingsValidationError('invalid defaults.quality')
  }
  if (!isOneOf(VIDEO_CODEC_VALUES, value.videoCodec)) {
    throw new SettingsValidationError('invalid defaults.videoCodec')
  }
  if (!isOneOf(AUDIO_CODEC_VALUES, value.audioCodec)) {
    throw new SettingsValidationError('invalid defaults.audioCodec')
  }
  if (!isOneOf(AUDIO_PACKAGING_VALUES, value.audioPackaging)) {
    throw new SettingsValidationError('invalid defaults.audioPackaging')
  }
  if (!isOneOf(SUBTITLE_STRATEGY_VALUES, value.subtitleStrategy)) {
    throw new SettingsValidationError('invalid defaults.subtitleStrategy')
  }
  return {
    container: value.container,
    quality: value.quality,
    videoCodec: value.videoCodec,
    audioCodec: value.audioCodec,
    audioSelection: validateSelection(value.audioSelection, 'defaults.audioSelection'),
    audioPackaging: value.audioPackaging,
    subtitleSelection: validateSelection(value.subtitleSelection, 'defaults.subtitleSelection'),
    subtitleStrategy: value.subtitleStrategy,
  }
}

function validatePresetOptions(value: unknown, label: string): PresetOptions {
  if (!isRecord(value)) throw new SettingsValidationError(`${label}: options debe ser un objeto`)
  assertOnlyKeys(
    value,
    [
      'container',
      'quality',
      'videoCodec',
      'audioCodec',
      'audioSelection',
      'audioPackaging',
      'subtitleSelection',
      'subtitleStrategy',
    ],
    `${label}.options`
  )
  if (Object.keys(value).length === 0) {
    throw new SettingsValidationError(`${label}: the preset must have at least one option`)
  }
  const result: PresetOptions = {}
  if (value.container !== undefined) {
    if (!isOneOf(CONTAINER_VALUES, value.container)) {
      throw new SettingsValidationError(`${label}: invalid container`)
    }
    result.container = value.container
  }
  if (value.quality !== undefined) {
    if (!isOneOf(QUALITY_VALUES, value.quality)) {
      throw new SettingsValidationError(`${label}: invalid quality`)
    }
    result.quality = value.quality
  }
  if (value.videoCodec !== undefined) {
    if (!isOneOf(VIDEO_CODEC_VALUES, value.videoCodec)) {
      throw new SettingsValidationError(`${label}: invalid videoCodec`)
    }
    result.videoCodec = value.videoCodec
  }
  if (value.audioCodec !== undefined) {
    if (!isOneOf(AUDIO_CODEC_VALUES, value.audioCodec)) {
      throw new SettingsValidationError(`${label}: invalid audioCodec`)
    }
    result.audioCodec = value.audioCodec
  }
  if (value.audioSelection !== undefined) {
    result.audioSelection = validateSelection(value.audioSelection, `${label}.audioSelection`)
  }
  if (value.audioPackaging !== undefined) {
    if (!isOneOf(AUDIO_PACKAGING_VALUES, value.audioPackaging)) {
      throw new SettingsValidationError(`${label}: invalid audioPackaging`)
    }
    result.audioPackaging = value.audioPackaging
  }
  if (value.subtitleSelection !== undefined) {
    result.subtitleSelection = validateSelection(
      value.subtitleSelection,
      `${label}.subtitleSelection`
    )
  }
  if (value.subtitleStrategy !== undefined) {
    if (!isOneOf(SUBTITLE_STRATEGY_VALUES, value.subtitleStrategy)) {
      throw new SettingsValidationError(`${label}: invalid subtitleStrategy`)
    }
    result.subtitleStrategy = value.subtitleStrategy
  }
  return result
}

function validatePreset(value: unknown, index: number): Preset {
  if (!isRecord(value)) throw new SettingsValidationError(`presets[${index}] debe ser un objeto`)
  assertOnlyKeys(value, ['id', 'name', 'description', 'tags', 'options'], `presets[${index}]`)
  if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(value.id)) {
    throw new SettingsValidationError(`presets[${index}].id is invalid`)
  }
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) {
    throw new SettingsValidationError(`presets[${index}].name is invalid`)
  }
  if (
    value.description !== undefined &&
    (typeof value.description !== 'string' || value.description.length > 240)
  ) {
    throw new SettingsValidationError(`presets[${index}].description is invalid`)
  }
  let tags: string[]
  try {
    tags = normalizePresetTags(value.tags)
  } catch (error) {
    throw new SettingsValidationError(
      `${`presets[${index}].tags`}: ${
        error instanceof PresetTagError ? error.message : 'invalid tags'
      }`
    )
  }
  return {
    id: value.id,
    name: value.name.trim(),
    ...(value.description ? { description: value.description.trim() } : {}),
    tags,
    options: validatePresetOptions(value.options, `presets[${index}]`),
  }
}

export function validateSettingsDocument(value: unknown): SettingsDocument {
  if (!isRecord(value)) throw new SettingsValidationError('Configuration must be an object')
  assertOnlyKeys(
    value,
    ['schemaVersion', 'revision', 'updatedAt', 'defaults', 'presets'],
    'settings'
  )
  if (value.schemaVersion !== 1) {
    throw new SettingsValidationError('schemaVersion no soportada')
  }
  if (!Number.isInteger(value.revision) || (value.revision as number) < 0) {
    throw new SettingsValidationError('invalid revision')
  }
  if (typeof value.updatedAt !== 'string') throw new SettingsValidationError('invalid updatedAt')
  if (!Array.isArray(value.presets)) throw new SettingsValidationError('presets debe ser un array')
  if (value.presets.length > 100)
    throw new SettingsValidationError('Too many presets (maximum 100)')
  const presets = value.presets.map(validatePreset)
  const ids = new Set<string>()
  for (const preset of presets) {
    if (ids.has(preset.id))
      throw new SettingsValidationError(`ID de preset duplicado: ${preset.id}`)
    ids.add(preset.id)
  }
  return {
    schemaVersion: 1,
    revision: value.revision as number,
    updatedAt: value.updatedAt,
    defaults: validateDefaults(value.defaults),
    presets,
  }
}

export function defaultSettings(): SettingsDocument {
  const document = structuredClone(DEFAULT_SETTINGS)
  document.updatedAt = new Date().toISOString()
  return document
}

interface LoadResult {
  document: SettingsDocument
  warning: string | null
}

class SettingsStore {
  private readonly file: string
  private cached: SettingsDocument | null = null
  private cachedMtime = 0
  private warning: string | null = null
  private loadPromise: Promise<LoadResult> | null = null
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(file: string) {
    this.file = file
  }

  async load(force = false): Promise<LoadResult> {
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = this.loadInternal(force).finally(() => {
      this.loadPromise = null
    })
    return this.loadPromise
  }

  private async loadInternal(force: boolean): Promise<LoadResult> {
    if (!force && this.cached) {
      try {
        const info = await stat(this.file)
        if (info.mtimeMs === this.cachedMtime) {
          return { document: this.cached, warning: this.warning }
        }
      } catch {
        // file disappeared: recreate it below
      }
    }

    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      let document = validateSettingsDocument(parsed)
      if (isLegacyFactorySettings(document)) {
        document = {
          ...document,
          revision: document.revision + 1,
          updatedAt: new Date().toISOString(),
          presets: structuredClone(DEFAULT_SETTINGS.presets),
        }
        await this.writeAtomic(document)
        return { document, warning: null }
      }
      const info = await stat(this.file)
      this.cached = document
      this.cachedMtime = info.mtimeMs
      this.warning = null
      return { document, warning: null }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const document = defaultSettings()
        document.updatedAt = new Date().toISOString()
        await this.writeAtomic(document)
        this.cached = document
        this.warning = null
        return { document, warning: null }
      }
      const message =
        error instanceof SettingsValidationError
          ? `The configuration file is invalid: ${error.message}`
          : 'Could not read the configuration file; factory defaults are being used'
      console.error('[settings]', message)
      const fallback = defaultSettings()
      this.cached = fallback
      this.warning = message
      return { document: fallback, warning: message }
    }
  }

  async get(): Promise<SettingsDocument> {
    return (await this.load()).document
  }

  async getWithWarning(): Promise<LoadResult> {
    return this.load()
  }

  private async writeAtomic(document: SettingsDocument): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
    const temp = `${this.file}.tmp-${randomUUID()}`
    const handle = await open(temp, 'w', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(document, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await copyFile(this.file, `${this.file}.bak`)
    } catch {
      // backup is best-effort
    }
    await rename(temp, this.file)
    const info = await stat(this.file)
    this.cached = document
    this.cachedMtime = info.mtimeMs
    this.warning = null
  }

  async save(input: unknown, expectedRevision: number): Promise<SettingsDocument> {
    const run = async (): Promise<SettingsDocument> => {
      const current = await this.get()
      if (!Number.isInteger(expectedRevision) || expectedRevision !== current.revision) {
        throw new SettingsConflictError()
      }
      const validated = validateSettingsDocument(input)
      const next: SettingsDocument = {
        ...validated,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      await this.writeAtomic(next)
      return next
    }
    const result = this.writeChain.then(run, run)
    this.writeChain = result.catch(() => undefined)
    return result
  }

  async findPreset(id: string | undefined): Promise<Preset | null> {
    if (!id) return null
    const { document } = await this.load()
    return document.presets.find((preset) => preset.id === id) ?? null
  }
}

let store: SettingsStore | null = null

export function getSettingsStore(): SettingsStore {
  if (!store) store = new SettingsStore(getConfig().settingsFile)
  return store
}

export function resetSettingsStoreForTests(): void {
  store = null
}
