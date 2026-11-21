import type { Locale, LocaleMode, ThemeMode } from '#lib/types.js'

declare global {
  namespace App {
    interface Error {
      message: string
      status?: number
    }

    interface Locals {
      locale: Locale
      localeMode: LocaleMode
      themeMode: ThemeMode
    }
  }
}

export {}
