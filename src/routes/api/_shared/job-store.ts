import { randomUUID } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import type { JobStage, JobState } from '#lib/types.js'
import type { DownloadPlan } from './plan.js'

export interface PersistedJob {
  version: 1
  id: string
  plan: DownloadPlan
  state: JobState
  stage: JobStage
  progress: number | null
  cached: boolean
  stored: boolean
  outputPath: string | null
  outputFilename: string | null
  outputKind: 'file' | 'zip' | null
  outputSize: number | null
  outputContentType: string | null
  error: string | null
  errorCode: string | null
  createdAt: string
  updatedAt: string
  workDir: string | null
  sourceComplete: boolean
  sourceBytes: number | null
  sourceContentLength: number | null
  attempts: number
  processingMs?: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATES = new Set<JobState>(['queued', 'running', 'ready', 'failed', 'cancelled'])
const STAGES = new Set<JobStage>([
  'queued',
  'preparing',
  'downloading-source',
  'downloading-subtitles',
  'processing-video',
  'extracting-audio',
  'extracting-subtitles',
  'packaging',
  'finalizing',
  'ready',
])

export class JobStore {
  private readonly directory: string

  constructor(directory: string) {
    this.directory = directory
  }

  private fileFor(id: string): string {
    if (!UUID.test(id)) throw new Error('Invalid job id')
    return path.join(this.directory, `${id}.json`)
  }

  async ensure(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
  }

  async save(job: PersistedJob): Promise<void> {
    await this.ensure()
    const target = this.fileFor(job.id)
    const temp = `${target}.tmp-${randomUUID()}`
    const handle = await open(temp, 'w', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(job, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temp, target)
  }

  async loadAll(): Promise<PersistedJob[]> {
    let names: string[]
    try {
      names = await readdir(this.directory)
    } catch {
      return []
    }
    const jobs: PersistedJob[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const id = name.slice(0, -5)
      if (!UUID.test(id)) continue
      try {
        const raw = await readFile(path.join(this.directory, name), 'utf8')
        const parsed = JSON.parse(raw) as unknown
        if (isPersistedJob(parsed)) jobs.push(parsed)
        else console.warn(`[jobs] Ignoring invalid state file ${name}`)
      } catch (error) {
        console.warn(`[jobs] Could not read state file ${name}`, error)
      }
    }
    return jobs
  }

  async remove(id: string): Promise<void> {
    await rm(this.fileFor(id), { force: true }).catch(() => undefined)
  }

  async cleanup(cutoff: number): Promise<void> {
    const jobs = await this.loadAll()
    for (const job of jobs) {
      if (job.state === 'queued' || job.state === 'running') continue
      if (Date.parse(job.updatedAt) >= cutoff) continue
      await this.remove(job.id)
    }
  }
}

function isPersistedJob(value: unknown): value is PersistedJob {
  if (!value || typeof value !== 'object') return false
  const job = value as Partial<PersistedJob>
  return (
    job.version === 1 &&
    typeof job.id === 'string' &&
    UUID.test(job.id) &&
    !!job.plan &&
    typeof job.plan === 'object' &&
    typeof job.plan.cacheKey === 'string' &&
    typeof job.plan.movieId === 'string' &&
    STATES.has(job.state as JobState) &&
    STAGES.has(job.stage as JobStage) &&
    typeof job.createdAt === 'string' &&
    typeof job.updatedAt === 'string' &&
    (job.processingMs === undefined ||
      (typeof job.processingMs === 'number' &&
        Number.isFinite(job.processingMs) &&
        job.processingMs >= 0)) &&
    typeof job.sourceComplete === 'boolean'
  )
}
