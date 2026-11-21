import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { LogEntry, LogLevel } from '#lib/types.js'
import { isLogLevel, safeLogEvent, safeLogMessage, sanitizeLogContext } from '#lib/logging.js'
import { getConfig } from './config.js'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.jsonl$/
const MAX_READ_BYTES = 2 * 1024 * 1024
let lastPruneDay = ''

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function validateDate(value: string | null | undefined): string | null {
  if (!value) return null
  return DATE_PATTERN.test(value) ? value : null
}

function logPath(date: string): string {
  return path.join(getConfig().logsDir, `${date}.jsonl`)
}

async function prune(): Promise<void> {
  const retention = getConfig().logsRetentionDays
  const day = today()
  if (retention <= 0 || lastPruneDay === day) return
  lastPruneDay = day
  const cutoff = Date.now() - retention * 24 * 60 * 60 * 1000
  const root = getConfig().logsDir
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return
  }
  for (const entry of entries) {
    const match = FILE_PATTERN.exec(entry)
    if (!match?.[1]) continue
    const file = path.join(root, entry)
    try {
      const info = await stat(file)
      if (info.mtimeMs < cutoff) await rm(file, { force: true })
    } catch {
      // ignore individual files
    }
  }
}

export async function logEvent(
  level: LogLevel,
  event: string,
  message: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    const cfg = getConfig()
    await mkdir(cfg.logsDir, { recursive: true })
    await prune()
    const timestamp = new Date().toISOString()
    const entry: LogEntry = {
      id: randomUUID(),
      timestamp,
      level,
      event: safeLogEvent(event),
      message: safeLogMessage(message),
      context: sanitizeLogContext(context),
    }
    await appendFile(logPath(timestamp.slice(0, 10)), `${JSON.stringify(entry)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
  } catch (error) {
    console.error('[logger] Could not write log entry:', error)
  }
}

async function listLogFiles(): Promise<{ date: string; file: string }[]> {
  const root = getConfig().logsDir
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return []
  }
  return entries
    .map((entry) => {
      const match = FILE_PATTERN.exec(entry)
      return match?.[1] ? { date: match[1], file: path.join(root, entry) } : null
    })
    .filter((entry): entry is { date: string; file: string } => Boolean(entry))
    .sort((a, b) => b.date.localeCompare(a.date))
}

function parseEntries(raw: string): LogEntry[] {
  const entries: LogEntry[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const value = JSON.parse(line) as Partial<LogEntry>
      if (
        typeof value.id !== 'string' ||
        typeof value.timestamp !== 'string' ||
        !isLogLevel(value.level) ||
        typeof value.event !== 'string' ||
        typeof value.message !== 'string'
      ) {
        continue
      }
      entries.push({
        id: value.id,
        timestamp: value.timestamp,
        level: value.level,
        event: value.event,
        message: value.message,
        context: value.context && typeof value.context === 'object' ? value.context : {},
      })
    } catch {
      // skip corrupt lines
    }
  }
  return entries
}

async function readEntryFile(file: string): Promise<LogEntry[]> {
  try {
    const info = await stat(file)
    if (info.size > MAX_READ_BYTES) {
      const raw = await readFile(file, 'utf8')
      return parseEntries(raw.slice(-MAX_READ_BYTES))
    }
    return parseEntries(await readFile(file, 'utf8'))
  } catch {
    return []
  }
}

export async function readLogs(input: {
  level?: LogLevel | null
  date?: string | null
  limit?: number
}): Promise<LogEntry[]> {
  const date = validateDate(input.date)
  const files = await listLogFiles()
  const selected = date ? files.filter((file) => file.date === date) : files
  const limit = Math.max(1, Math.min(input.limit ?? 200, 1000))
  const entries: LogEntry[] = []
  for (const file of selected) {
    const fileEntries = await readEntryFile(file.file)
    for (let index = fileEntries.length - 1; index >= 0; index -= 1) {
      const entry = fileEntries[index]
      if (!entry) continue
      if (input.level && entry.level !== input.level) continue
      entries.push(entry)
      if (entries.length >= limit) return entries
    }
  }
  return entries
}

export async function deleteLogs(date?: string | null): Promise<number> {
  const target = validateDate(date)
  const files = await listLogFiles()
  const selected = target ? files.filter((file) => file.date === target) : files
  let removed = 0
  for (const file of selected) {
    try {
      await rm(file.file, { force: true })
      removed += 1
    } catch {
      // ignore
    }
  }
  return removed
}

export async function readLogFile(date?: string | null): Promise<{
  filename: string
  content: string
} | null> {
  const target = validateDate(date) ?? today()
  const file = logPath(target)
  try {
    const content = await readFile(file, 'utf8')
    return { filename: `${target}.jsonl`, content }
  } catch {
    return null
  }
}

export function logsRetentionDays(): number {
  return getConfig().logsRetentionDays
}
