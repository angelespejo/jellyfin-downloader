import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { JobStore, type PersistedJob } from '#api/_shared/job-store.ts'
import type { DownloadPlan } from '#api/_shared/plan.ts'

const plan: DownloadPlan = {
  schemaVersion: 1,
  movieId: '11111111111111111111111111111111',
  movieTitle: 'Test movie',
  movieYear: 2020,
  sourceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  sourceContainer: 'mkv',
  sourceVideoCodec: 'h264',
  sourceFingerprint: 'etag:1:20:mkv',
  sourceSizeBytes: 1000,
  runtimeTicks: 200_000_000,
  durationSeconds: 20,
  container: 'mkv',
  quality: 'original',
  effectiveQuality: 'original',
  targetHeight: null,
  scaleHeight: null,
  videoCodec: 'copy',
  videoEncoder: null,
  videoPreset: 'medium',
  crf: 20,
  hardware: null,
  audioCodec: 'copy',
  audioEncoder: null,
  audioBitrate: null,
  audioPackaging: 'mux',
  audio: [],
  subtitles: [],
  burnSubtitleIndex: null,
  outputKind: 'file',
  expectedFiles: 1,
  downloadName: 'Test movie.mkv',
  cacheKey: 'a'.repeat(64),
}

function record(overrides: Partial<PersistedJob> = {}): PersistedJob {
  const now = new Date().toISOString()
  return {
    version: 1,
    id: '123e4567-e89b-12d3-a456-426614174000',
    plan,
    state: 'ready',
    stage: 'ready',
    progress: 1,
    cached: false,
    stored: true,
    outputPath: '/tmp/test.mkv',
    outputFilename: 'Test movie.mkv',
    outputKind: 'file',
    outputSize: 1000,
    outputContentType: 'video/x-matroska',
    error: null,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
    workDir: null,
    sourceComplete: true,
    sourceBytes: 1000,
    sourceContentLength: 1000,
    attempts: 1,
    processingMs: 1500,
    ...overrides,
  }
}

test('JobStore persists and restores job state atomically', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jf-job-store-'))
  try {
    const store = new JobStore(directory)
    await store.save(record())
    const loaded = await store.loadAll()
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0]?.id, record().id)
    assert.equal(loaded[0]?.plan.movieTitle, 'Test movie')
    assert.equal(loaded[0]?.processingMs, 1500)
    const raw = await readFile(path.join(directory, `${record().id}.json`), 'utf8')
    assert.match(raw, /"cacheKey"/)
    assert.doesNotMatch(raw, /JELLYFIN_API_KEY/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('JobStore ignores corrupt files and cleans terminal jobs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jf-job-store-'))
  try {
    const store = new JobStore(directory)
    await store.save(record())
    await writeFile(path.join(directory, 'corrupt.json'), '{not json', 'utf8')
    assert.equal((await store.loadAll()).length, 1)

    await store.cleanup(Date.now() + 1000)
    assert.equal((await store.loadAll()).length, 0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('JobStore keep files under the configured directory', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jf-job-store-'))
  try {
    const store = new JobStore(directory)
    await store.save(record())
    const loaded = await store.loadAll()
    assert.ok(loaded[0]?.outputPath?.startsWith('/tmp/'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
