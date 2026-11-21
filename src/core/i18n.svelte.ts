import { browser } from '$app/env'
import { getContext, setContext } from 'svelte'
import { COOKIE_MAX_AGE, LOCALE_COOKIE } from '#const'
import type { JobStage, Locale, LocaleMode } from '#lib/types.js'
import {
  detectBrowserLocale,
  stageLabel,
  translate,
  translateError,
  type TranslationParams,
} from '#lib/i18n/translate.js'
import type { MessageKey } from '#locales/en.js'

const I18N_KEY = Symbol('jellyfin-downloader-i18n')

export interface I18nContext {
  readonly locale: Locale
  readonly mode: LocaleMode
  t(key: MessageKey, params?: TranslationParams): string
  error(code: string | null | undefined, fallback?: string | null): string
  stage(stage: JobStage | string): string
  setMode(mode: LocaleMode): void
}

function writeLocaleCookie(mode: LocaleMode): void {
  if (!browser) return
  document.cookie = `${LOCALE_COOKIE}=${mode}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
}

export function createI18n(initialLocale: Locale, initialMode: LocaleMode): I18nContext {
  let locale = $state<Locale>(initialLocale)
  let mode = $state<LocaleMode>(initialMode)

  const context: I18nContext = {
    get locale() {
      return locale
    },
    get mode() {
      return mode
    },
    t(key, params) {
      return translate(locale, key, params)
    },
    error(code, fallback) {
      return translateError(locale, code, fallback)
    },
    stage(stage) {
      return stageLabel(locale, stage)
    },
    setMode(next) {
      mode = next
      locale = next === 'auto' ? detectBrowserLocale() : next
      if (browser) {
        document.documentElement.lang = locale
        writeLocaleCookie(next)
      }
    },
  }

  setContext(I18N_KEY, context)
  return context
}

const fallback: I18nContext = {
  locale: 'en',
  mode: 'auto',
  t: (key, params) => translate('en', key, params),
  error: (code, message) => translateError('en', code, message),
  stage: (stage) => stageLabel('en', stage),
  setMode: () => undefined,
}

export function getI18n(): I18nContext {
  return getContext<I18nContext>(I18N_KEY) ?? fallback
}
