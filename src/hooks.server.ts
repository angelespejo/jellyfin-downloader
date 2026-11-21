import type { Handle, HandleServerError } from '@sveltejs/kit/hooks'
import { applyCors, corsHeaders } from '#api/_shared/api.js'
import { LOCALE_COOKIE, THEME_COOKIE } from '#const'
import type { LocaleMode, ThemeMode } from '#lib/types.js'
import { isLocaleMode, resolveLocaleMode } from '#lib/i18n/translate.js'
import { logEvent } from '#api/_shared/logger.js'

function isApi(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

function themeMode(value: string | undefined): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = new URL(event.request.url).pathname
  const localeCookie = event.cookies.get(LOCALE_COOKIE)
  const localeMode: LocaleMode = isLocaleMode(localeCookie) ? localeCookie : 'auto'
  const locale = resolveLocaleMode(localeMode, event.request.headers.get('accept-language'))
  const theme = themeMode(event.cookies.get(THEME_COOKIE))
  event.locals.locale = locale
  event.locals.localeMode = localeMode
  event.locals.themeMode = theme

  if (event.request.method === 'OPTIONS' && isApi(pathname)) {
    return new Response(null, { status: 204, headers: corsHeaders(event.request) })
  }

  const response = await resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replaceAll('%lang%', locale).replaceAll('%theme%', theme),
  })
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  const secured = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
  return isApi(pathname) ? applyCors(secured, event.request) : secured
}

export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind === 'app') {
    const message = error instanceof Error ? error.message : 'Application error'
    return { message, status: (error as { status?: number }).status }
  }
  console.error(`[sveltekit] ${event.request.method} ${event.url.pathname}`, error)
  void logEvent('error', 'app.error', 'Unhandled application error', {
    method: event.request.method,
    route: event.url.pathname,
  })
  return { message: 'Internal server error', status: 500 }
}
