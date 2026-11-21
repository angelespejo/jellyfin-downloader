import { spawn } from 'node:child_process'
import { access, stat } from 'node:fs/promises'
import path from 'node:path'
import { constants as fsConstants } from 'node:fs'
import { getConfig } from './config'

export interface FfmpegInfo {
  available: boolean
  version: string | null
  encoders: string[]
  filters: string[]
  hwaccels: string[]
  error?: string
}

interface ResolvedFfmpeg {
  path: string
  version: string
  encoders: Set<string>
  filters: Set<string>
  hwaccels: Set<string>
}

interface CaptureResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

let cached: ResolvedFfmpeg | null = null
let cachedFailure: { at: number; message: string } | null = null
const FAILURE_TTL_MS = 30_000

function binaryName(): string {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

function defaultCandidates(): string[] {
  return [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    '/bin/ffmpeg',
    '/snap/bin/ffmpeg',
    '/usr/lib/jellyfin-ffmpeg/ffmpeg',
    '/usr/lib/jellyfin-ffmpeg/ffmpeg.exe',
  ]
}

function pathCandidates(): string[] {
  const pathValue = process.env.PATH ?? ''
  return pathValue
    .split(path.delimiter)
    .map((directory) => directory.trim())
    .filter(Boolean)
    .map((directory) => path.join(directory, binaryName()))
}

function expandCandidate(candidate: string): string[] {
  const trimmed = candidate.trim()
  if (!trimmed) return []
  const looksLikeDirectory = trimmed.endsWith('/') || trimmed.endsWith('\\')
  const hasSeparator = trimmed.includes('/') || trimmed.includes('\\')
  if (looksLikeDirectory || (!hasSeparator && trimmed === 'ffmpeg')) {
    if (!hasSeparator) {
      return pathCandidates()
    }
    return [path.join(trimmed, binaryName())]
  }
  if (hasSeparator) {
    return [path.resolve(process.cwd(), trimmed)]
  }
  return pathCandidates()
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function candidates(): string[] {
  const config = getConfig()
  const fromEnvPath = config.ffmpegPath ? expandCandidate(config.ffmpegPath) : []
  const fromEnvList = config.ffmpegCandidates.flatMap(expandCandidate)
  return unique([...fromEnvPath, ...fromEnvList, ...defaultCandidates(), ...pathCandidates()])
}

function runCapture(binary: string, args: string[], timeoutMs: number): Promise<CaptureResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(binary, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < 256_000) stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 256_000) stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr: `${stderr}${error.message}`, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

function parseVersion(stdout: string): string | null {
  const firstLine = stdout.split(/\r?\n/, 1)[0]?.trim() ?? ''
  return /^ffmpeg version\s+/i.test(firstLine) ? firstLine : null
}

function parseEncoders(stdout: string): Set<string> {
  const encoders = new Set<string>()
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*[VASD.]{6}\s+(\S+)/)
    if (match?.[1]) encoders.add(match[1])
  }
  return encoders
}

function parseFilters(stdout: string): Set<string> {
  const filters = new Set<string>()
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*[A-Z.]{1,3}\s+(\S+)/)
    if (match?.[1]) filters.add(match[1])
  }
  return filters
}

function parseHwaccels(stdout: string): Set<string> {
  const hwaccels = new Set<string>()
  for (const line of stdout.split(/\r?\n/)) {
    const value = line.trim().toLowerCase()
    if (!value || value.endsWith(':')) continue
    if (/^[a-z0-9_]+$/.test(value)) hwaccels.add(value)
  }
  return hwaccels
}

async function isValidExecutable(file: string): Promise<boolean> {
  try {
    const info = await stat(file)
    if (!info.isFile()) return false
    await access(file, process.platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

export async function resolveFfmpeg(): Promise<ResolvedFfmpeg> {
  if (cached) return cached
  if (cachedFailure && Date.now() - cachedFailure.at < FAILURE_TTL_MS) {
    throw new Error(cachedFailure.message)
  }

  const attempted: string[] = []
  for (const candidate of candidates()) {
    const variants = [candidate]
    try {
      const info = await stat(candidate)
      if (info.isDirectory()) variants.push(path.join(candidate, binaryName()))
    } catch {
      // no existe; se prueba igualmente como archivo
    }
    for (const variant of variants) {
      attempted.push(variant)
      if (!(await isValidExecutable(variant))) continue

      const versionResult = await runCapture(variant, ['-version'], 5_000)
      const version = parseVersion(versionResult.stdout)
      if (versionResult.code !== 0 || !version) continue

      const encoderResult = await runCapture(variant, ['-hide_banner', '-encoders'], 10_000)
      const encoders =
        encoderResult.code === 0 ? parseEncoders(encoderResult.stdout) : new Set<string>()
      const filterResult = await runCapture(variant, ['-hide_banner', '-filters'], 10_000)
      const filters =
        filterResult.code === 0 ? parseFilters(filterResult.stdout) : new Set<string>()
      const hwaccelResult = await runCapture(variant, ['-hide_banner', '-hwaccels'], 10_000)
      const hwaccels =
        hwaccelResult.code === 0 ? parseHwaccels(hwaccelResult.stdout) : new Set<string>()

      cached = { path: variant, version, encoders, filters, hwaccels }
      cachedFailure = null
      return cached
    }
  }

  const message = `No valid ffmpeg found. Checked paths: ${attempted.join(', ')}`
  cachedFailure = { at: Date.now(), message }
  throw new Error(message)
}

export async function getFfmpegInfo(): Promise<FfmpegInfo> {
  try {
    const resolved = await resolveFfmpeg()
    return {
      available: true,
      version: resolved.version,
      encoders: [...resolved.encoders].sort(),
      filters: [...resolved.filters].sort(),
      hwaccels: [...resolved.hwaccels].sort(),
    }
  } catch (error) {
    return {
      available: false,
      version: null,
      encoders: [],
      filters: [],
      hwaccels: [],
      error: error instanceof Error ? error.message : 'ffmpeg unavailable',
    }
  }
}

export async function requireFfmpeg(): Promise<{ path: string; version: string }> {
  const resolved = await resolveFfmpeg()
  return { path: resolved.path, version: resolved.version }
}

export async function hasEncoder(encoder: string): Promise<boolean> {
  const resolved = await resolveFfmpeg()
  return resolved.encoders.has(encoder)
}

export async function hasFilter(filter: string): Promise<boolean> {
  const resolved = await resolveFfmpeg()
  return resolved.filters.has(filter)
}

export function resetFfmpegCacheForTests(): void {
  cached = null
  cachedFailure = null
}
