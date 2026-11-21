import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, open, readdir, readFile, rename, rm, stat, statfs } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { DownloadConfig, LocalDownloadInfo } from '#lib/types.js'
import { getConfig } from './config.js'
import { isInside, safeJoin } from './files.js'

export interface StoredObjectMeta {
  schema: 1
  key: string
  createdAt: string
  sizeBytes: number
  filename: string
  kind: 'file' | 'zip'
  contentType: string
  internalName: string
  movieId?: string | null
  seriesId?: string | null
  movieTitle?: string | null
  movieYear?: number | null
  sourceId?: string | null
  config?: DownloadConfig | null
}

export interface StoredObject {
  path: string
  meta: StoredObjectMeta
}

const KEY_PATTERN = /^[a-f0-9]{64}$/
const INTERNAL_PATTERN = /^output\.[a-z0-9]{2,8}$/

function validateKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key')
  return key
}

function objectDirectory(root: string, key: string): string {
  const safeKey = validateKey(key)
  return safeJoin(root, 'objects', safeKey.slice(0, 2), safeKey)
}

function parseConfig(value: unknown): DownloadConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<DownloadConfig>
  if (
    (candidate.presetId !== undefined &&
      candidate.presetId !== null &&
      typeof candidate.presetId !== 'string') ||
    (candidate.presetName !== undefined &&
      candidate.presetName !== null &&
      typeof candidate.presetName !== 'string') ||
    (candidate.mediaSourceId !== undefined &&
      candidate.mediaSourceId !== null &&
      typeof candidate.mediaSourceId !== 'string') ||
    !candidate.options ||
    typeof candidate.options !== 'object' ||
    Array.isArray(candidate.options)
  ) {
    return null
  }
  return {
    presetId: candidate.presetId ?? null,
    presetName: candidate.presetName ?? null,
    mediaSourceId: candidate.mediaSourceId ?? null,
    options: candidate.options,
  }
}

function parseMeta(raw: string, expectedKey: string): StoredObjectMeta | null {
  try {
    const value = JSON.parse(raw) as Partial<StoredObjectMeta>
    if (
      value.schema !== 1 ||
      value.key !== expectedKey ||
      typeof value.createdAt !== 'string' ||
      !Number.isInteger(value.sizeBytes) ||
      (value.sizeBytes as number) < 0 ||
      typeof value.filename !== 'string' ||
      (value.kind !== 'file' && value.kind !== 'zip') ||
      typeof value.contentType !== 'string' ||
      typeof value.internalName !== 'string' ||
      !INTERNAL_PATTERN.test(value.internalName) ||
      (value.movieId !== undefined &&
        value.movieId !== null &&
        typeof value.movieId !== 'string') ||
      (value.seriesId !== undefined &&
        value.seriesId !== null &&
        typeof value.seriesId !== 'string') ||
      (value.movieTitle !== undefined &&
        value.movieTitle !== null &&
        typeof value.movieTitle !== 'string') ||
      (value.movieYear !== undefined &&
        value.movieYear !== null &&
        !Number.isInteger(value.movieYear)) ||
      (value.sourceId !== undefined &&
        value.sourceId !== null &&
        typeof value.sourceId !== 'string')
    ) {
      return null
    }
    if (value.config !== undefined && value.config !== null) {
      value.config = parseConfig(value.config)
      if (!value.config) return null
    }
    return value as StoredObjectMeta
  } catch {
    return null
  }
}

function toInfo(key: string, meta: StoredObjectMeta): LocalDownloadInfo {
  return {
    key,
    filename: meta.filename,
    sizeBytes: meta.sizeBytes,
    createdAt: meta.createdAt,
    kind: meta.kind,
    movieId: meta.movieId ?? null,
    seriesId: meta.seriesId ?? null,
    movieTitle: meta.movieTitle ?? null,
    movieYear: meta.movieYear ?? null,
    downloadUrl: `/api/v1/local-downloads/${key}/file`,
    config: meta.config ?? null,
  }
}

export class LocalDownloadsStore {
  private readonly root: string
  private readonly enabled: boolean
  private readonly maxBytes: number
  private readonly ttlMs: number
  private countsCache: { at: number; value: Map<string, number> } | null = null

  constructor() {
    const config = getConfig()
    this.root = config.localDownloadsDir
    this.enabled = config.localDownloadsEnabled
    this.maxBytes = config.localDownloadsMaxBytes
    this.ttlMs = config.localDownloadsTtlMs
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async ensureReady(): Promise<void> {
    if (!this.enabled) return
    await mkdir(path.join(this.root, 'objects'), { recursive: true })
    await mkdir(path.join(this.root, 'work'), { recursive: true })
  }

  async createWorkDir(): Promise<string> {
    const id = randomUUID()
    const directory = this.enabled
      ? path.join(this.root, 'work', id)
      : await mkdtemp(path.join(os.tmpdir(), 'jellyfin-downloader-'))
    await mkdir(directory, { recursive: true })
    return directory
  }

  async cleanupWorkDir(directory: string): Promise<void> {
    if (!directory) return
    const allowed = this.enabled
      ? isInside(path.join(this.root, 'work'), directory)
      : isInside(os.tmpdir(), directory) &&
        path.basename(directory).startsWith('jellyfin-downloader-')
    if (!allowed) return
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }

  async cleanupStaleWork(): Promise<void> {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    if (!this.enabled) {
      let entries: string[]
      try {
        entries = await readdir(os.tmpdir())
      } catch {
        return
      }
      for (const entry of entries) {
        if (!entry.startsWith('jellyfin-downloader-')) continue
        const directory = path.join(os.tmpdir(), entry)
        try {
          const info = await stat(directory)
          if (info.mtimeMs < cutoff) await rm(directory, { recursive: true, force: true })
        } catch {
          // ignore
        }
      }
      return
    }
    const workRoot = path.join(this.root, 'work')
    let entries: string[]
    try {
      entries = await readdir(workRoot)
    } catch {
      return
    }
    for (const entry of entries) {
      if (!/^[0-9a-f-]{36}$/i.test(entry)) continue
      const directory = path.join(workRoot, entry)
      try {
        const info = await stat(directory)
        if (info.mtimeMs < cutoff) await rm(directory, { recursive: true, force: true })
      } catch {
        // ignore missing entries
      }
    }
  }

  async lookup(key: string): Promise<StoredObject | null> {
    if (!this.enabled) return null
    let directory: string
    try {
      directory = objectDirectory(this.root, key)
    } catch {
      return null
    }
    try {
      const metaRaw = await readFile(path.join(directory, 'meta.json'), 'utf8')
      const meta = parseMeta(metaRaw, key)
      if (!meta) return null
      const file = path.join(directory, meta.internalName)
      const info = await stat(file)
      if (!info.isFile() || info.size !== meta.sizeBytes) return null
      return { path: file, meta }
    } catch {
      return null
    }
  }

  async get(key: string): Promise<LocalDownloadInfo | null> {
    const stored = await this.lookup(key)
    return stored ? toInfo(key, stored.meta) : null
  }

  async commit(input: {
    key: string
    outputPath: string
    filename: string
    kind: 'file' | 'zip'
    contentType: string
    movieId?: string | null
    seriesId?: string | null
    movieTitle?: string | null
    movieYear?: number | null
    sourceId?: string | null
    config?: DownloadConfig | null
  }): Promise<StoredObject | null> {
    if (!this.enabled) return null
    await this.ensureReady()
    const key = validateKey(input.key)
    const directory = objectDirectory(this.root, key)
    const extension = path.extname(input.outputPath).replace(/^\./, '').toLowerCase()
    if (!/^[a-z0-9]{2,8}$/.test(extension)) throw new Error('Invalid output extension')
    const internalName = `output.${extension}`

    const existing = await this.lookup(key)
    if (existing) return existing

    await mkdir(directory, { recursive: true })
    const target = path.join(directory, internalName)
    try {
      await rename(input.outputPath, target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
      const { copyFile } = await import('node:fs/promises')
      await copyFile(input.outputPath, target)
      await rm(input.outputPath, { force: true })
    }

    const info = await stat(target)
    const meta: StoredObjectMeta = {
      schema: 1,
      key,
      createdAt: new Date().toISOString(),
      sizeBytes: info.size,
      filename: input.filename,
      kind: input.kind,
      contentType: input.contentType,
      internalName,
      movieId: input.movieId ?? null,
      seriesId: input.seriesId ?? null,
      movieTitle: input.movieTitle ?? null,
      movieYear: input.movieYear ?? null,
      sourceId: input.sourceId ?? null,
      config: input.config ?? null,
    }
    const metaTemp = path.join(directory, `meta.json.tmp-${randomUUID()}`)
    const handle = await open(metaTemp, 'w', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(meta, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(metaTemp, path.join(directory, 'meta.json'))
    this.countsCache = null
    await this.prune(key)
    return { path: target, meta }
  }

  async list(): Promise<LocalDownloadInfo[]> {
    if (!this.enabled) return []
    const objectsRoot = path.join(this.root, 'objects')
    let prefixes: string[]
    try {
      prefixes = await readdir(objectsRoot)
    } catch {
      return []
    }
    const items: LocalDownloadInfo[] = []
    for (const prefix of prefixes) {
      if (!/^[a-f0-9]{2}$/.test(prefix)) continue
      const prefixDir = path.join(objectsRoot, prefix)
      let keys: string[]
      try {
        keys = await readdir(prefixDir)
      } catch {
        continue
      }
      for (const key of keys) {
        if (!KEY_PATTERN.test(key)) continue
        const stored = await this.lookup(key)
        if (!stored) continue
        items.push(toInfo(key, stored.meta))
      }
    }
    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  async getMovieCounts(): Promise<Map<string, number>> {
    if (!this.enabled) return new Map()
    if (this.countsCache && Date.now() - this.countsCache.at < 10_000) {
      return this.countsCache.value
    }
    const counts = new Map<string, number>()
    for (const item of await this.list()) {
      if (item.movieId) {
        counts.set(item.movieId, (counts.get(item.movieId) ?? 0) + 1)
      }
      if (item.seriesId) {
        counts.set(item.seriesId, (counts.get(item.seriesId) ?? 0) + 1)
      }
    }
    this.countsCache = { at: Date.now(), value: counts }
    return counts
  }

  async remove(key: string): Promise<boolean> {
    if (!this.enabled) return false
    let directory: string
    try {
      directory = objectDirectory(this.root, key)
    } catch {
      return false
    }
    try {
      await rm(directory, { recursive: true, force: true })
      this.countsCache = null
      return true
    } catch {
      return false
    }
  }

  async storageStatus(): Promise<{ enabled: boolean; usedBytes: number; objects: number }> {
    if (!this.enabled) return { enabled: false, usedBytes: 0, objects: 0 }
    const items = await this.list()
    return {
      enabled: true,
      usedBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
      objects: items.length,
    }
  }

  async prune(exceptKey?: string): Promise<void> {
    if (!this.enabled || (this.maxBytes <= 0 && this.ttlMs <= 0)) return
    const objectsRoot = path.join(this.root, 'objects')
    let prefixes: string[]
    try {
      prefixes = await readdir(objectsRoot)
    } catch {
      return
    }
    const entries: { key: string; directory: string; createdAt: number; size: number }[] = []
    for (const prefix of prefixes) {
      if (!/^[a-f0-9]{2}$/.test(prefix)) continue
      const prefixDir = path.join(objectsRoot, prefix)
      let keys: string[]
      try {
        keys = await readdir(prefixDir)
      } catch {
        continue
      }
      for (const key of keys) {
        if (!KEY_PATTERN.test(key)) continue
        const stored = await this.lookup(key)
        if (!stored) continue
        const createdAt = Date.parse(stored.meta.createdAt)
        entries.push({
          key,
          directory: path.join(prefixDir, key),
          createdAt: Number.isNaN(createdAt) ? 0 : createdAt,
          size: stored.meta.sizeBytes,
        })
      }
    }
    entries.sort((a, b) => a.createdAt - b.createdAt)
    const now = Date.now()
    let total = entries.reduce((sum, entry) => sum + entry.size, 0)
    for (const entry of entries) {
      if (entry.key === exceptKey) continue
      const expired = this.ttlMs > 0 && now - entry.createdAt > this.ttlMs
      const overLimit = this.maxBytes > 0 && total > this.maxBytes
      if (!expired && !overLimit) continue
      await rm(entry.directory, { recursive: true, force: true }).catch(() => undefined)
      total -= entry.size
    }
    this.countsCache = null
  }

  async ensureDiskSpace(requiredBytes: number | null): Promise<void> {
    if (!requiredBytes || requiredBytes <= 0) return
    const target = this.enabled ? this.root : os.tmpdir()
    try {
      await mkdir(target, { recursive: true })
      const info = await statfs(target)
      const free = Number(info.bavail) * Number(info.bsize)
      const margin = 512 * 1024 * 1024
      if (free < requiredBytes + margin) {
        throw new Error('Not enough disk space to download this movie')
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('not enough disk space')) throw error
      // If statfs is unavailable, do not block the download.
    }
  }
}

let store: LocalDownloadsStore | null = null

export function getLocalDownloadsStore(): LocalDownloadsStore {
  if (!store) store = new LocalDownloadsStore()
  return store
}

export function resetLocalDownloadsStoreForTests(): void {
  store = null
}
