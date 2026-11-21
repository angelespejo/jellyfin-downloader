import type { LogLevel } from './types.js'

export const LOG_LEVELS: readonly LogLevel[] = ['info', 'warn', 'error'] as const

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)
}

const SENSITIVE_KEY = /(api[_-]?key|token|secret|password|authorization|cookie|path|dir)/i

export function sanitizeLogContext(
  value: unknown,
  depth = 0
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, string | number | boolean | null> = {}
  if (depth > 2) return output
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) continue
    if (raw === null || typeof raw === 'boolean' || typeof raw === 'number') {
      output[key] = raw
      continue
    }
    if (typeof raw === 'string') {
      output[key] = raw.replace(/[\r\n\t]+/g, ' ').slice(0, 500)
      continue
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      const nested = sanitizeLogContext(raw, depth + 1)
      for (const [nestedKey, nestedValue] of Object.entries(nested)) {
        output[`${key}.${nestedKey}`] = nestedValue
      }
    }
  }
  return output
}

export function safeLogMessage(value: unknown, fallback = 'Unknown event'): string {
  if (typeof value !== 'string') return fallback
  const cleaned = value
    .replace(/\/(?:Users|home|tmp|var|app|opt|private)\/[^\s"']*/g, '[path]')
    .replace(/[A-Za-z]:\\[^\s"']*/g, '[path]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 500)
  return cleaned || fallback
}

export function safeLogEvent(value: unknown, fallback = 'app.event'): string {
  if (typeof value !== 'string') return fallback
  const cleaned = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9._-]{0,80}$/.test(cleaned) ? cleaned : fallback
}
