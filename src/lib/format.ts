import type { Locale } from './types.js'

export function formatBytes(bytes: number | null | undefined, locale: Locale = 'en'): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2,
  }).format(value)
  return `${formatted} ${units[unit]}`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0)
    return '—'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatTicks(ticks: number | null | undefined): number | null {
  if (ticks === null || ticks === undefined || !Number.isFinite(ticks) || ticks <= 0) return null
  return ticks / 10_000_000
}

export function formatProcessingTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '—'
  return formatDuration(Math.max(1, Math.round(ms / 1000)))
}

export function formatLanguage(code: string | null | undefined, locale: Locale = 'en'): string {
  if (!code) return '—'
  try {
    const display = new Intl.DisplayNames([locale], { type: 'language' })
    return display.of(code) ?? code
  } catch {
    return code
  }
}

export function formatTimestamp(iso: string | null | undefined, locale: Locale = 'en'): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}
