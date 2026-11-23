import { browser } from '$app/env'
import type { DownloadJobStatus, DownloadQueueResponse } from '#lib/types.js'

/**
 * Shared queue state for the active download badges, the downloads page and the
 * modal queue tab. One polling loop serves every mounted consumer.
 */

const ACTIVE_INTERVAL_MS = 2000
const IDLE_INTERVAL_MS = 10_000

let jobs = $state<DownloadJobStatus[]>([])
let loading = $state(false)
let error = $state(false)
let mounted = 0
let timer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<void> | null = null
let visibilityBound = false

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function schedule(delay: number): void {
  clearTimer()
  timer = setTimeout(() => void refresh(), delay)
}

function bindVisibility(): void {
  if (visibilityBound || !browser) return
  visibilityBound = true
  document.addEventListener('visibilitychange', () => {
    if (mounted === 0) return
    if (document.hidden) clearTimer()
    else void refresh()
  })
}

export async function refresh(): Promise<void> {
  if (!browser || mounted === 0) return
  if (inflight) return inflight
  const initial = jobs.length === 0
  if (initial) loading = true
  inflight = (async () => {
    try {
      const response = await fetch('/api/v1/downloads?state=active&limit=100')
      if (!response.ok) throw new Error('queue request failed')
      const body = (await response.json()) as DownloadQueueResponse
      jobs = body.jobs ?? []
      error = false
    } catch {
      error = true
    } finally {
      loading = false
      inflight = null
      if (mounted > 0 && !document.hidden) {
        schedule(jobs.length > 0 ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS)
      }
    }
  })()
  return inflight
}

export interface CancelResult {
  ok: boolean
  job: DownloadJobStatus | null
  code: string | null
}

export async function cancelJob(id: string): Promise<CancelResult> {
  try {
    const response = await fetch(`/api/v1/downloads/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
    const payload = (await response.json().catch(() => null)) as
      (DownloadJobStatus & { error?: { code?: string } }) | null
    if (!response.ok) {
      return { ok: false, job: null, code: payload?.error?.code ?? 'INTERNAL_ERROR' }
    }
    await refresh()
    return { ok: true, job: payload as DownloadJobStatus, code: null }
  } catch {
    return { ok: false, job: null, code: 'INTERNAL_ERROR' }
  }
}

export function startQueue(): void {
  mounted += 1
  if (mounted !== 1 || !browser) return
  bindVisibility()
  if (!document.hidden) void refresh()
}

export function stopQueue(): void {
  mounted = Math.max(0, mounted - 1)
  if (mounted === 0) clearTimer()
}

const queue = {
  get jobs(): DownloadJobStatus[] {
    return jobs
  },
  get activeCount(): number {
    return jobs.length
  },
  get loading(): boolean {
    return loading
  },
  get error(): boolean {
    return error
  },
  refresh,
  cancelJob,
  start: startQueue,
  stop: stopQueue,
}

export function getDownloadQueue(): typeof queue {
  return queue
}
