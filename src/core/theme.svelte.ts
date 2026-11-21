import { browser } from '$app/env'
import { getContext, setContext } from 'svelte'
import { COOKIE_MAX_AGE, THEME_COOKIE } from '#const'
import type { ThemeMode } from '#lib/types.js'

const THEME_KEY = Symbol('jellyfin-downloader-theme')

export interface ThemeContext {
  readonly mode: ThemeMode
  setMode(mode: ThemeMode): void
}

function applyTheme(mode: ThemeMode): void {
  if (browser) {
    document.documentElement.dataset.theme = mode
    document.cookie = `${THEME_COOKIE}=${mode}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  }
}

export function createTheme(initialMode: ThemeMode): ThemeContext {
  let mode = $state<ThemeMode>(initialMode)

  if (browser) document.documentElement.dataset.theme = initialMode

  const context: ThemeContext = {
    get mode() {
      return mode
    },
    setMode(next) {
      mode = next
      applyTheme(next)
    },
  }

  setContext(THEME_KEY, context)
  return context
}

const fallback: ThemeContext = {
  mode: 'system',
  setMode: () => undefined,
}

export function getTheme(): ThemeContext {
  return getContext<ThemeContext>(THEME_KEY) ?? fallback
}
