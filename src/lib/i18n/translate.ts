import { en, type MessageKey } from '#locales/en.js'
import { es } from '#locales/es.js'
import { ca } from '#locales/ca.js'
import type { JobStage, Locale, LocaleMode } from '#lib/types.js'

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, es, ca }

export type TranslationParams = Record<string, string | number>

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'es' || value === 'ca'
}

export function isLocaleMode(value: string | null | undefined): value is LocaleMode {
  return value === 'auto' || value === 'en' || value === 'es' || value === 'ca'
}

export function localeFromLanguageTag(tag: string | null | undefined): Locale {
  const base = (tag ?? '')
    .trim()
    .toLowerCase()
    .split(/[-_;,]/)[0]
  if (base === 'es') return 'es'
  if (base === 'ca') return 'ca'
  return 'en'
}

/** First browser language wins: Spanish -> es, Catalan -> ca, anything else -> en. */
export function resolveLocaleFromAcceptLanguage(header: string | null): Locale {
  if (!header) return 'en'
  return localeFromLanguageTag(header.split(',')[0])
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  return localeFromLanguageTag(navigator.languages?.[0] ?? navigator.language)
}

export function resolveLocaleMode(mode: LocaleMode, acceptLanguage: string | null): Locale {
  return mode === 'auto' ? resolveLocaleFromAcceptLanguage(acceptLanguage) : mode
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}

export function translate(locale: Locale, key: MessageKey, params?: TranslationParams): string {
  const dictionary = DICTIONARIES[locale] ?? en
  return interpolate(dictionary[key] ?? en[key] ?? key, params)
}

export function hasTranslation(key: string): key is MessageKey {
  return Object.hasOwn(en, key)
}

export function translateError(
  locale: Locale,
  code: string | null | undefined,
  fallback: string | null | undefined
): string {
  const key = code ? `errors.${code}` : null
  if (key && hasTranslation(key)) return translate(locale, key)
  return fallback || translate(locale, 'errors.INTERNAL_ERROR')
}

export function stageLabel(locale: Locale, stage: JobStage | string): string {
  const key = `status.stage.${stage}`
  return hasTranslation(key) ? translate(locale, key) : stage
}
