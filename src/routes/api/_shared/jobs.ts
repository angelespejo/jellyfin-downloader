import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform, type Readable as NodeReadable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type {
  BatchDownloadError,
  BatchDownloadResult,
  CreateBatchDownloadRequest,
  CreateDownloadRequest,
  DownloadJobStatus,
  JobOutput,
  LocalDownloadsCheckResult,
} from '#lib/types.js'
import { getConfig } from './config.js'
import { getJellyfinClient, JellyfinError } from './jellyfin.js'
import { getMovieSource, type InternalMediaSource } from './media.js'
import { buildPlan, disableHardwareInPlan, PlanError, type DownloadPlan } from './plan.js'
import { buildProcessingPlan, type FfmpegCommand, type ProcessingPlan } from './ffmpeg-args.js'
import { getFfmpegInfo, requireFfmpeg } from './ffmpeg.js'
import { detectHardware } from './hardware.js'
import { getSettingsStore } from './settings.js'
import { getLocalDownloadsStore, type StoredObject } from './local-downloads.js'
import { contentTypeForExtension } from './files.js'
import { writeZipFile } from './zip.js'
import type { JellyfinItem } from './jellyfin-types.js'
import { JobStore, type PersistedJob } from './job-store.js'
import { logEvent } from './logger.js'

export class JobError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 500, code = 'JOB_ERROR') {
    super(message)
    this.name = 'JobError'
    this.status = status
    this.code = code
  }
}

class FfmpegError extends Error {
  readonly details: string

  constructor(details: string) {
    super('ffmpeg processing failed')
    this.name = 'FfmpegError'
    this.details = details
  }
}

interface JobRecord extends PersistedJob {
  controller: AbortController
  child: ChildProcessByStdio<null, NodeReadable, NodeReadable> | null
  cancelRequested: boolean
  lastPersist: number
}

interface PreparedPlan {
  item: JellyfinItem
  source: InternalMediaSource
  plan: DownloadPlan
}

const jobs = new Map<string, JobRecord>()
const queue: string[] = []
const activeByKey = new Map<string, string>()
let active = 0
let manager: JobManager | null = null
const JOB_TTL_MS = 6 * 60 * 60 * 1000
const PERSIST_INTERVAL_MS = 1500

function safeExtension(value: string | undefined | null): string {
  const extension = (value ?? '').toLowerCase()
  return /^[a-z0-9]{2,8}$/.test(extension) ? extension : 'bin'
}

function friendlyError(error: unknown): string {
  if (error instanceof PlanError) return error.message
  if (error instanceof JobError) return error.message
  if (error instanceof JellyfinError) return error.message
  if (error instanceof FfmpegError) return error.message
  if (error instanceof Error && /space/i.test(error.message)) return error.message
  return 'Could not complete the download. Check the server logs.'
}

function errorCode(error: unknown): string {
  if (error instanceof PlanError) return error.code
  if (error instanceof JobError) return error.code
  if (error instanceof JellyfinError) {
    return error.status === 404 ? 'MOVIE_NOT_FOUND' : 'JELLYFIN_ERROR'
  }
  if (error instanceof FfmpegError) return 'FFMPEG_ERROR'
  if (error instanceof Error && /space/i.test(error.message)) return 'INSUFFICIENT_SPACE'
  return 'INTERNAL_ERROR'
}

function validateId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new JobError(`Invalid ${label}`, 400, 'INVALID_REQUEST')
  }
  return value
}

export async function preparePlan(input: CreateDownloadRequest): Promise<PreparedPlan> {
  if (!input || typeof input !== 'object') {
    throw new JobError('Invalid request body', 400, 'INVALID_REQUEST')
  }
  const movieId = validateId(input.movieId, 'movieId')
  if (input.mediaSourceId !== undefined && typeof input.mediaSourceId !== 'string') {
    throw new JobError('Invalid mediaSourceId', 400, 'INVALID_REQUEST')
  }
  if (input.preset !== undefined && typeof input.preset !== 'string') {
    throw new JobError('Invalid preset', 400, 'INVALID_REQUEST')
  }
  if (
    input.options !== undefined &&
    (typeof input.options !== 'object' || input.options === null)
  ) {
    throw new JobError('Invalid options', 400, 'INVALID_REQUEST')
  }

  const client = getJellyfinClient()
  const item = await client.getMovie(movieId)
  if (item.Type === 'Series') {
    throw new JobError(
      'Series cannot be downloaded directly; choose an episode',
      400,
      'SERIES_NOT_DOWNLOADABLE'
    )
  }
  const source = getMovieSource(item, input.mediaSourceId)

  const settingsStore = getSettingsStore()
  const settings = await settingsStore.get()
  let presetOptions
  let presetMeta: { id: string; name: string } | null = null
  if (input.preset) {
    const preset = await settingsStore.findPreset(input.preset)
    if (!preset) throw new JobError('The requested preset does not exist', 400, 'PRESET_NOT_FOUND')
    presetOptions = preset.options
    presetMeta = { id: preset.id, name: preset.name }
  }

  const ffmpeg = await getFfmpegInfo()
  if (!ffmpeg.available || !ffmpeg.version) {
    throw new JobError('ffmpeg is not available on the server', 503, 'FFMPEG_UNAVAILABLE')
  }

  const plan = buildPlan({
    item,
    source,
    options: input.options,
    presetOptions,
    preset: presetMeta,
    mediaSourceId: input.mediaSourceId ?? source.id,
    defaults: settings.defaults,
    environment: {
      ffmpegVersion: ffmpeg.version,
      encoders: ffmpeg.encoders,
      filters: ffmpeg.filters,
      hardware: await detectHardware(ffmpeg.encoders),
    },
  })
  return { item, source, plan }
}

function outputFor(job: JobRecord): JobOutput | null {
  if (!job.outputPath || !job.outputFilename || !job.outputKind || job.outputSize === null) {
    return null
  }
  return {
    kind: job.outputKind,
    filename: job.outputFilename,
    sizeBytes: job.outputSize,
    downloadUrl: `/api/v1/downloads/${job.id}/file`,
  }
}

function toStatus(job: JobRecord): DownloadJobStatus {
  return {
    id: job.id,
    title: job.plan.movieTitle,
    filename: job.plan.downloadName,
    movieId: job.plan.movieId,
    seriesId: job.plan.seriesId ?? null,
    sourceSizeBytes: job.plan.sourceSizeBytes,
    state: job.state,
    stage: job.stage,
    progress: job.progress,
    queuePosition: job.state === 'queued' ? Math.max(1, queue.indexOf(job.id) + 1) : null,
    cached: job.cached,
    stored: job.stored,
    expectedFiles: job.plan.expectedFiles,
    output: outputFor(job),
    error: job.error,
    errorCode: job.errorCode,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

function touch(job: JobRecord): void {
  job.updatedAt = new Date().toISOString()
}

function updateProgress(job: JobRecord, value: number | null): void {
  job.progress = value === null ? null : Math.max(0, Math.min(1, value))
  touch(job)
}

function persisted(job: JobRecord): PersistedJob {
  return {
    version: 1,
    id: job.id,
    plan: job.plan,
    state: job.state,
    stage: job.stage,
    progress: job.progress,
    cached: job.cached,
    stored: job.stored,
    outputPath: job.outputPath,
    outputFilename: job.outputFilename,
    outputKind: job.outputKind,
    outputSize: job.outputSize,
    outputContentType: job.outputContentType,
    error: job.error,
    errorCode: job.errorCode,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    workDir: job.workDir,
    sourceComplete: job.sourceComplete,
    sourceBytes: job.sourceBytes,
    sourceContentLength: job.sourceContentLength,
    attempts: job.attempts,
  }
}

async function downloadExternalSubtitles(
  job: JobRecord,
  workDir: string
): Promise<Map<number, string>> {
  const files = new Map<number, string>()
  const subtitles = job.plan.subtitles.filter((subtitle) => subtitle.isExternal)
  if (subtitles.length === 0) return files

  job.stage = 'downloading-subtitles'
  touch(job)
  const client = getJellyfinClient()
  for (let index = 0; index < subtitles.length; index += 1) {
    const subtitle = subtitles[index]
    if (!subtitle) continue
    const format = safeExtension(subtitle.outputFormat)
    const file = path.join(workDir, `external-${subtitle.index}.${format}`)
    try {
      const info = await stat(file)
      if (info.isFile() && info.size > 0) {
        files.set(subtitle.index, file)
        continue
      }
    } catch {
      // not downloaded yet
    }
    const response = await client.getSubtitle(
      job.plan.movieId,
      job.plan.sourceId,
      {
        Index: subtitle.index,
        DeliveryUrl: subtitle.deliveryUrl ?? undefined,
      },
      format
    )
    if (!response.body) throw new JobError('Jellyfin did not return the subtitle', 502)
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > 30 * 1024 * 1024) {
      throw new JobError('The subtitle is too large', 422)
    }
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length > 30 * 1024 * 1024) {
      throw new JobError('The subtitle is too large', 422)
    }
    await writeFile(file, data)
    files.set(subtitle.index, file)
    updateProgress(job, 0.03 + (0.07 * (index + 1)) / subtitles.length)
  }
  return files
}

async function downloadSource(job: JobRecord, workDir: string): Promise<string> {
  const extension = safeExtension(job.plan.sourceContainer)
  const sourcePath = path.join(workDir, `source.${extension}`)

  if (job.sourceComplete) {
    try {
      const info = await stat(sourcePath)
      const matches =
        info.isFile() &&
        info.size > 0 &&
        (job.sourceContentLength === null || info.size === job.sourceContentLength)
      if (matches) {
        job.sourceBytes = info.size
        return sourcePath
      }
    } catch {
      // source disappeared; re-download below
    }
    job.sourceComplete = false
  }

  await rm(sourcePath, { force: true }).catch(() => undefined)
  job.stage = 'downloading-source'
  updateProgress(job, 0.1)

  const client = getJellyfinClient()
  const response = await client.getStream(
    job.plan.movieId,
    job.plan.sourceId,
    job.controller.signal
  )
  if (!response.body) throw new JobError('Jellyfin did not return the movie content', 502)
  const contentLength = Number(
    response.headers.get('content-length') ?? job.plan.sourceSizeBytes ?? 0
  )
  job.sourceContentLength = contentLength || null
  const store = getLocalDownloadsStore()
  await store.ensureDiskSpace(contentLength || null)

  let received = 0
  let lastUpdate = 0
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      const now = Date.now()
      if (now - lastUpdate > 400) {
        lastUpdate = now
        const fraction = contentLength > 0 ? Math.min(1, received / contentLength) : 0.5
        updateProgress(job, 0.1 + fraction * 0.28)
      }
      callback(null, chunk)
    },
  })

  const readable = Readable.fromWeb(
    response.body as import('node:stream/web').ReadableStream<Uint8Array>
  )
  await pipeline(readable, counter, createWriteStream(sourcePath), {
    signal: job.controller.signal,
  })
  const info = await stat(sourcePath)
  if (info.size === 0) throw new JobError('The source download is empty', 502)
  job.sourceComplete = true
  job.sourceBytes = info.size
  updateProgress(job, 0.38)
  return sourcePath
}

function runFfmpeg(
  job: JobRecord,
  command: FfmpegCommand,
  ffmpegPath: string,
  progressStart: number,
  progressEnd: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, command.args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    job.child = child
    let stderr = ''
    let stdoutRemainder = ''
    let lastUpdate = 0
    let outTimeSeconds = 0

    const onAbort = (): void => {
      child.kill('SIGKILL')
    }
    if (job.controller.signal.aborted) onAbort()
    job.controller.signal.addEventListener('abort', onAbort, { once: true })

    child.stdout.on('data', (chunk: Buffer) => {
      const text = stdoutRemainder + chunk.toString('utf8')
      const lines = text.split(/\r?\n/)
      stdoutRemainder = lines.pop() ?? ''
      for (const line of lines) {
        const match = line.match(/^(out_time_us|out_time_ms)=(\d+)$/)
        if (!match) continue
        outTimeSeconds = Number(match[2]) / 1_000_000
        const now = Date.now()
        if (now - lastUpdate < 500) continue
        lastUpdate = now
        if (job.plan.durationSeconds && job.plan.durationSeconds > 0) {
          const fraction = Math.min(1, outTimeSeconds / job.plan.durationSeconds)
          updateProgress(job, progressStart + fraction * (progressEnd - progressStart))
        } else {
          updateProgress(job, (progressStart + progressEnd) / 2)
        }
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 16_000) stderr += chunk.toString('utf8')
    })

    const cleanup = (): void => {
      job.controller.signal.removeEventListener('abort', onAbort)
      job.child = null
    }

    child.on('error', (error) => {
      cleanup()
      reject(new JobError(`Could not start ffmpeg: ${error.message}`, 502, 'FFMPEG_SPAWN'))
    })
    child.on('close', (code) => {
      cleanup()
      if (job.controller.signal.aborted) {
        reject(new JobError('Download cancelled', 499, 'CANCELLED'))
        return
      }
      if (code !== 0) {
        reject(new FfmpegError(stderr.slice(-8_000)))
        return
      }
      resolve()
    })
  })
}

async function cleanupFailedVideoOutputs(workDir: string): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(workDir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.startsWith('video.') || entry.startsWith('burn-') || entry === 'output.zip') {
      await rm(path.join(workDir, entry), { force: true, recursive: true }).catch(() => undefined)
    }
  }
}

async function runProcessing(
  job: JobRecord,
  processing: ProcessingPlan,
  ffmpegPath: string,
  persistStage: () => Promise<void>
): Promise<void> {
  if (processing.burnPreparation) {
    job.stage = 'processing-video'
    touch(job)
    await persistStage()
    await runFfmpeg(job, processing.burnPreparation, ffmpegPath, 0.38, 0.42)
  }

  job.stage = 'processing-video'
  touch(job)
  await persistStage()
  await runFfmpeg(job, processing.video, ffmpegPath, 0.42, 0.72)

  if (processing.audio.length) {
    job.stage = 'extracting-audio'
    touch(job)
    await persistStage()
    for (let index = 0; index < processing.audio.length; index += 1) {
      const command = processing.audio[index]
      if (!command) continue
      await runFfmpeg(
        job,
        command,
        ffmpegPath,
        0.72 + (0.1 * index) / processing.audio.length,
        0.72 + (0.1 * (index + 1)) / processing.audio.length
      )
    }
  }

  if (processing.subtitles.length) {
    job.stage = 'extracting-subtitles'
    touch(job)
    await persistStage()
    for (let index = 0; index < processing.subtitles.length; index += 1) {
      const command = processing.subtitles[index]
      if (!command) continue
      await runFfmpeg(
        job,
        command,
        ffmpegPath,
        0.82 + (0.08 * index) / processing.subtitles.length,
        0.82 + (0.08 * (index + 1)) / processing.subtitles.length
      )
    }
  }
}

async function cleanupWorkExcept(workDir: string, keep: string): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(workDir)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(workDir, entry)
    if (path.resolve(full) === path.resolve(keep)) continue
    await rm(full, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function cleanupIntermediateOutputs(
  workDir: string,
  sourcePath: string,
  externalFiles: Map<number, string>
): Promise<void> {
  const keep = new Set([
    path.basename(sourcePath),
    ...[...externalFiles.values()].map((file) => path.basename(file)),
  ])
  let entries: string[]
  try {
    entries = await readdir(workDir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (keep.has(entry)) continue
    if (
      entry === 'output.zip' ||
      entry.startsWith('video.') ||
      entry.startsWith('audio-') ||
      entry.startsWith('subtitle-') ||
      entry.startsWith('burn-') ||
      entry.endsWith('.tmp')
    ) {
      await rm(path.join(workDir, entry), { force: true, recursive: true }).catch(() => undefined)
    }
  }
}

function contentTypeFor(pathValue: string): string {
  return contentTypeForExtension(path.extname(pathValue).replace(/^\./, ''))
}

async function finalizeOutput(
  job: JobRecord,
  processing: ProcessingPlan,
  workDir: string,
  persist: () => Promise<void>
): Promise<void> {
  job.stage = 'packaging'
  updateProgress(job, 0.94)
  await persist()

  let outputPath: string
  let kind: 'file' | 'zip'
  let contentType: string
  let filename: string

  if (job.plan.outputKind === 'zip') {
    outputPath = path.join(workDir, 'output.zip')
    await writeZipFile(
      processing.artifacts.map((artifact) => ({ name: artifact.entryName, path: artifact.path })),
      outputPath
    )
    kind = 'zip'
    contentType = 'application/zip'
    filename = job.plan.downloadName
  } else {
    outputPath = processing.video.output
    kind = 'file'
    contentType = contentTypeFor(outputPath)
    filename = job.plan.downloadName
  }

  const info = await stat(outputPath)
  if (!info.isFile() || info.size === 0) {
    throw new JobError('The output file is empty', 500, 'EMPTY_OUTPUT')
  }

  const store = getLocalDownloadsStore()
  const stored = await store.commit({
    key: job.plan.cacheKey,
    outputPath,
    filename,
    kind,
    contentType,
    movieId: job.plan.movieId,
    seriesId: job.plan.seriesId ?? null,
    movieTitle: job.plan.movieTitle,
    movieYear: job.plan.movieYear,
    sourceId: job.plan.sourceId,
    sourceSizeBytes: job.plan.sourceSizeBytes,
    config: job.plan.config ?? null,
  })

  if (stored) {
    job.outputPath = stored.path
    job.outputSize = stored.meta.sizeBytes
    job.outputFilename = stored.meta.filename
    job.outputKind = stored.meta.kind
    job.outputContentType = stored.meta.contentType
    job.stored = true
    await store.cleanupWorkDir(workDir)
    job.workDir = null
  } else {
    job.outputPath = outputPath
    job.outputSize = info.size
    job.outputFilename = filename
    job.outputKind = kind
    job.outputContentType = contentType
    job.stored = false
    await cleanupWorkExcept(workDir, outputPath)
    job.workDir = workDir
  }

  job.stage = 'finalizing'
  updateProgress(job, 0.99)
  await persist()
}

function baseRecord(plan: DownloadPlan): JobRecord {
  const now = new Date().toISOString()
  return {
    version: 1,
    id: randomUUID(),
    plan,
    state: 'queued',
    stage: 'queued',
    progress: 0,
    cached: false,
    stored: false,
    outputPath: null,
    outputFilename: null,
    outputKind: null,
    outputSize: null,
    outputContentType: null,
    error: null,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
    workDir: null,
    sourceComplete: false,
    sourceBytes: null,
    sourceContentLength: null,
    attempts: 0,
    controller: new AbortController(),
    child: null,
    cancelRequested: false,
    lastPersist: 0,
  }
}

function readyRecord(plan: DownloadPlan, stored: StoredObject): JobRecord {
  const record = baseRecord(plan)
  record.state = 'ready'
  record.stage = 'ready'
  record.progress = 1
  record.cached = true
  record.stored = true
  record.outputPath = stored.path
  record.outputFilename = stored.meta.filename
  record.outputKind = stored.meta.kind
  record.outputSize = stored.meta.sizeBytes
  record.outputContentType = stored.meta.contentType
  return record
}

function hydrate(persistedJob: PersistedJob): JobRecord {
  return {
    ...persistedJob,
    controller: new AbortController(),
    child: null,
    cancelRequested: false,
    lastPersist: 0,
  }
}

class JobManager {
  private readonly store = new JobStore(getConfig().jobsDir)
  private readonly readyPromise: Promise<void>
  private processing = false
  private shuttingDown = false

  constructor() {
    this.readyPromise = this.restore()
    setInterval(() => void this.cleanup(), 10 * 60 * 1000).unref()
    void getLocalDownloadsStore()
      .cleanupStaleWork()
      .catch(() => undefined)
  }

  async ready(): Promise<void> {
    await this.readyPromise
  }

  private async persist(job: JobRecord, force = false): Promise<void> {
    const now = Date.now()
    if (!force && now - job.lastPersist < PERSIST_INTERVAL_MS) return
    job.lastPersist = now
    try {
      await this.store.save(persisted(job))
    } catch (error) {
      console.error(`[jobs] Could not persist job ${job.id}`, error)
    }
  }

  private async restore(): Promise<void> {
    await this.store.ensure()
    const restored = await this.store.loadAll()
    restored.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    const store = getLocalDownloadsStore()

    for (const persistedJob of restored) {
      const job = hydrate(persistedJob)
      if (job.state === 'queued' || job.state === 'running') {
        if (store.isEnabled()) {
          const stored = await store.lookup(job.plan.cacheKey)
          if (stored) {
            job.state = 'ready'
            job.stage = 'ready'
            job.progress = 1
            job.cached = true
            job.stored = true
            job.outputPath = stored.path
            job.outputFilename = stored.meta.filename
            job.outputKind = stored.meta.kind
            job.outputSize = stored.meta.sizeBytes
            job.outputContentType = stored.meta.contentType
            job.error = null
            job.errorCode = null
            jobs.set(job.id, job)
            await this.persist(job, true)
            continue
          }
        }
        job.state = 'queued'
        job.stage = 'preparing'
        job.progress = 0
        job.error = null
        job.errorCode = null
        queue.push(job.id)
        activeByKey.set(job.plan.cacheKey, job.id)
        jobs.set(job.id, job)
        await this.persist(job, true)
        continue
      }

      if (job.state === 'ready' && job.outputPath) {
        try {
          const info = await stat(job.outputPath)
          if (!info.isFile() || info.size === 0) throw new Error('missing')
        } catch {
          job.state = 'failed'
          job.stage = 'ready'
          job.error = 'The output file is missing'
          job.errorCode = 'OUTPUT_MISSING'
          await this.persist(job, true)
        }
      }
      jobs.set(job.id, job)
    }

    if (queue.length) setTimeout(() => void this.processQueue(), 0)

    if (restored.length) {
      let queued = 0
      let ready = 0
      let failed = 0
      for (const persistedJob of restored) {
        const state = jobs.get(persistedJob.id)?.state
        if (state === 'queued' || state === 'running') queued += 1
        else if (state === 'ready') ready += 1
        else if (state === 'failed') failed += 1
      }
      void logEvent('info', 'jobs.restored', `Restored ${restored.length} job(s)`, {
        total: restored.length,
        queued,
        ready,
        failed,
      })
    }
  }

  async create(input: CreateDownloadRequest): Promise<DownloadJobStatus> {
    await this.ready()
    const { plan } = await preparePlan(input)
    const store = getLocalDownloadsStore()
    const stored = await store.lookup(plan.cacheKey)
    if (stored) {
      const job = readyRecord(plan, stored)
      jobs.set(job.id, job)
      await this.persist(job, true)
      void logEvent('info', 'job.cached', `Reused stored result for ${plan.movieTitle}`, {
        jobId: job.id,
        movieId: plan.movieId,
        filename: plan.downloadName,
      })
      return toStatus(job)
    }

    const activeId = activeByKey.get(plan.cacheKey)
    if (activeId) {
      const existing = jobs.get(activeId)
      if (existing && (existing.state === 'queued' || existing.state === 'running')) {
        return toStatus(existing)
      }
      activeByKey.delete(plan.cacheKey)
    }

    if (queue.length >= getConfig().maxQueuedJobs) {
      throw new JobError('The download queue is full; try again later', 429, 'QUEUE_FULL')
    }

    const job = baseRecord(plan)
    jobs.set(job.id, job)
    activeByKey.set(plan.cacheKey, job.id)
    queue.push(job.id)
    touch(job)
    await this.persist(job, true)
    void this.processQueue()
    void logEvent('info', 'job.created', `Queued download for ${plan.movieTitle}`, {
      jobId: job.id,
      movieId: plan.movieId,
      preset: plan.presetName ?? 'custom',
      filename: plan.downloadName,
    })
    return toStatus(job)
  }

  async createBatch(input: CreateBatchDownloadRequest): Promise<BatchDownloadResult> {
    if (!input || typeof input !== 'object' || !Array.isArray(input.movieIds)) {
      throw new JobError('Invalid batch request', 400, 'INVALID_REQUEST')
    }
    const ids = [...new Set(input.movieIds.map((id) => validateId(id, 'movieId')))]
    if (ids.length === 0) {
      throw new JobError('The batch is empty', 400, 'INVALID_REQUEST')
    }
    if (ids.length > 50) {
      throw new JobError('A batch can contain at most 50 items', 400, 'BATCH_TOO_LARGE')
    }
    if (input.options?.audioStreamIndices || input.options?.subtitleStreamIndices) {
      throw new JobError(
        'Batch downloads use track selection strategies, not explicit stream indices',
        400,
        'INVALID_BATCH_OPTIONS'
      )
    }
    const jobs: DownloadJobStatus[] = []
    const errors: BatchDownloadError[] = []
    for (const movieId of ids) {
      try {
        jobs.push(
          await this.create({
            movieId,
            mediaSourceId: input.mediaSourceId,
            preset: input.preset,
            options: input.options,
          })
        )
      } catch (error) {
        errors.push({
          movieId,
          code: error instanceof JobError ? error.code : 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Could not create the job',
        })
      }
    }
    void logEvent(
      errors.length ? 'warn' : 'info',
      'job.batch',
      `Batch download created: ${jobs.length} job(s), ${errors.length} error(s)`,
      { requested: ids.length, created: jobs.length, failed: errors.length }
    )
    return { jobs, errors }
  }

  async check(input: CreateDownloadRequest): Promise<LocalDownloadsCheckResult> {
    await this.ready()
    const { plan } = await preparePlan(input)
    const store = getLocalDownloadsStore()
    if (!store.isEnabled()) return { enabled: false, hit: false }
    const stored = await store.lookup(plan.cacheKey)
    if (!stored) return { enabled: true, hit: false }
    return {
      enabled: true,
      hit: true,
      key: plan.cacheKey,
      sizeBytes: stored.meta.sizeBytes,
      createdAt: stored.meta.createdAt,
      filename: stored.meta.filename,
      kind: stored.meta.kind,
    }
  }

  async status(id: string): Promise<DownloadJobStatus> {
    await this.ready()
    const job = jobs.get(id)
    if (!job) throw new JobError('Job not found', 404, 'JOB_NOT_FOUND')
    return toStatus(job)
  }

  async list(options: { state?: 'active' | 'all'; limit?: number } = {}): Promise<{
    jobs: DownloadJobStatus[]
    total: number
    active: number
  }> {
    await this.ready()
    const all = [...jobs.values()]
    const isActive = (job: JobRecord) => job.state === 'queued' || job.state === 'running'
    const filtered = options.state === 'all' ? all : all.filter(isActive)
    const rank = (job: JobRecord) => (job.state === 'running' ? 0 : job.state === 'queued' ? 1 : 2)
    const sorted = [...filtered].sort((a, b) => {
      const byRank = rank(a) - rank(b)
      if (byRank !== 0) return byRank
      if (a.state === 'queued' && b.state === 'queued') {
        return queue.indexOf(a.id) - queue.indexOf(b.id)
      }
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    })
    const limit = Math.min(100, Math.max(1, options.limit ?? 50))
    return {
      jobs: sorted.slice(0, limit).map(toStatus),
      total: sorted.length,
      active: all.filter(isActive).length,
    }
  }

  async download(id: string): Promise<{ job: JobRecord; path: string }> {
    await this.ready()
    const job = jobs.get(id)
    if (!job) throw new JobError('Job not found', 404, 'JOB_NOT_FOUND')
    if (job.state !== 'ready' || !job.outputPath) {
      throw new JobError('The download is not ready yet', 409, 'JOB_NOT_READY')
    }
    return { job, path: job.outputPath }
  }

  async cancel(id: string): Promise<DownloadJobStatus> {
    await this.ready()
    const job = jobs.get(id)
    if (!job) throw new JobError('Job not found', 404, 'JOB_NOT_FOUND')
    if (job.state === 'ready' || job.state === 'failed' || job.state === 'cancelled') {
      throw new JobError('The job has already finished', 409, 'JOB_FINISHED')
    }
    job.cancelRequested = true
    job.controller.abort()
    if (job.child) job.child.kill('SIGKILL')
    if (job.state === 'queued') {
      const index = queue.indexOf(job.id)
      if (index >= 0) queue.splice(index, 1)
      job.state = 'cancelled'
      job.stage = 'ready'
      job.error = 'Download cancelled'
      job.errorCode = 'CANCELLED'
      touch(job)
      await this.persist(job, true)
      activeByKey.delete(job.plan.cacheKey)
      if (job.workDir) await getLocalDownloadsStore().cleanupWorkDir(job.workDir)
      void logEvent(
        'warn',
        'job.cancelled',
        `Cancelled queued download: ${job.plan.downloadName}`,
        {
          jobId: job.id,
          movieId: job.plan.movieId,
        }
      )
    }
    return toStatus(job)
  }

  private async runJob(job: JobRecord): Promise<void> {
    job.state = 'running'
    job.stage = 'preparing'
    job.error = null
    job.errorCode = null
    updateProgress(job, 0.01)
    await this.persist(job, true)

    const store = getLocalDownloadsStore()
    let workDir: string | null = job.workDir
    try {
      await store.ensureReady()
      if (!workDir) workDir = await store.createWorkDir()
      else await mkdir(workDir, { recursive: true })
      job.workDir = workDir
      job.attempts += 1

      const externalSubtitleFiles = await downloadExternalSubtitles(job, workDir)
      const sourcePath = await downloadSource(job, workDir)
      await this.persist(job, true)

      const processing = buildProcessingPlan({
        plan: job.plan,
        sourcePath,
        workDir,
        externalSubtitleFiles,
      })
      await cleanupIntermediateOutputs(workDir, sourcePath, externalSubtitleFiles)
      const ffmpeg = await requireFfmpeg()
      let activeProcessing = processing
      try {
        await runProcessing(job, processing, ffmpeg.path, () => this.persist(job, true))
      } catch (error) {
        if (
          !(error instanceof FfmpegError) ||
          !job.plan.hardware ||
          String(job.stage) !== 'processing-video' ||
          job.controller.signal.aborted
        ) {
          throw error
        }
        console.warn('[jobs] Hardware encoding failed, retrying with software:', error.details)
        void logEvent(
          'warn',
          'job.hardware-fallback',
          `Hardware encoding failed for ${job.plan.movieTitle}; retrying in software`,
          { jobId: job.id, movieId: job.plan.movieId, hardware: job.plan.hardware.mode }
        )
        job.plan = disableHardwareInPlan(job.plan)
        job.error = null
        job.errorCode = null
        await cleanupFailedVideoOutputs(workDir)
        await this.persist(job, true)
        activeProcessing = buildProcessingPlan({
          plan: job.plan,
          sourcePath,
          workDir,
          externalSubtitleFiles,
        })
        await runProcessing(job, activeProcessing, ffmpeg.path, () => this.persist(job, true))
      }
      await finalizeOutput(job, activeProcessing, workDir, () => this.persist(job, true))

      job.state = 'ready'
      job.stage = 'ready'
      job.error = null
      job.errorCode = null
      updateProgress(job, 1)
      await this.persist(job, true)
      void logEvent('info', 'job.ready', `Download ready: ${job.plan.downloadName}`, {
        jobId: job.id,
        movieId: job.plan.movieId,
        stored: job.stored,
        filename: job.plan.downloadName,
      })
    } catch (error) {
      if (this.shuttingDown) {
        job.state = 'queued'
        job.stage = 'preparing'
        job.progress = 0
        job.error = null
        job.errorCode = null
        touch(job)
        await this.persist(job, true)
        return
      }

      if (job.cancelRequested || job.controller.signal.aborted) {
        job.state = 'cancelled'
        job.error = 'Download cancelled'
        job.errorCode = 'CANCELLED'
      } else {
        job.state = 'failed'
        job.error = friendlyError(error)
        job.errorCode = errorCode(error)
        console.error(`[jobs] ${job.id}:`, error)
        if (error instanceof FfmpegError) console.error(error.details)
      }
      job.stage = 'ready'
      if (workDir) await store.cleanupWorkDir(workDir)
      job.workDir = null
      touch(job)
      await this.persist(job, true)
      void logEvent(
        job.state === 'failed' ? 'error' : 'warn',
        job.state === 'cancelled' ? 'job.cancelled' : 'job.failed',
        job.error ?? 'Download failed',
        {
          jobId: job.id,
          movieId: job.plan.movieId,
          errorCode: job.errorCode ?? '',
          filename: job.plan.downloadName,
        }
      )
    } finally {
      job.child = null
      if (!this.shuttingDown) job.controller = new AbortController()
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (active < getConfig().maxConcurrentJobs && queue.length > 0) {
        const id = queue.shift()
        if (!id) continue
        const job = jobs.get(id)
        if (!job || job.state !== 'queued') continue
        active += 1
        void this.runJob(job).finally(() => {
          active -= 1
          activeByKey.delete(job.plan.cacheKey)
          void this.processQueue()
        })
      }
    } finally {
      this.processing = false
    }
  }

  private async cleanup(): Promise<void> {
    const store = getLocalDownloadsStore()
    await store.prune().catch(() => undefined)
    const cutoff = Date.now() - JOB_TTL_MS
    await this.store.cleanup(cutoff)
    for (const [id, job] of jobs) {
      if (job.state === 'queued' || job.state === 'running') continue
      if (Date.parse(job.updatedAt) >= cutoff) continue
      if (job.workDir) await store.cleanupWorkDir(job.workDir)
      jobs.delete(id)
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    for (const job of jobs.values()) {
      if (job.state === 'queued' || job.state === 'running') {
        job.state = 'queued'
        job.stage = 'preparing'
        job.progress = 0
        job.error = null
        job.errorCode = null
        touch(job)
        await this.persist(job, true)
      }
      job.controller.abort()
      if (job.child) job.child.kill('SIGKILL')
    }
  }
}

export function getJobManager(): JobManager {
  if (!manager) manager = new JobManager()
  return manager
}

const globalShutdownKey = Symbol.for('jellyfin-downloader.shutdown-registered')
if (!(globalThis as Record<symbol, unknown>)[globalShutdownKey]) {
  ;(globalThis as Record<symbol, unknown>)[globalShutdownKey] = true
  process.on('sveltekit:shutdown', () => {
    void manager?.shutdown()
  })
}

export function resetJobManagerForTests(): void {
  jobs.clear()
  queue.length = 0
  activeByKey.clear()
  active = 0
  manager = null
}
