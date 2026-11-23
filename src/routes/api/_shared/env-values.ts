/**
 * Helpers for translating raw environment values into typed configuration.
 *
 * Kept free of `$app/env` imports so they can be unit tested in plain Node.
 */

/** Returns the first non-empty, trimmed value. */
export function pickFirstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

/** Parses an optional boolean flag, using `fallback` when the value is empty. */
export function envBoolean(value: string | undefined, fallback: boolean): boolean {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  return ['1', 'true', 'yes', 'on'].includes(trimmed.toLowerCase())
}
