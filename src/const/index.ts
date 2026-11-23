import PKG from '../../package.json' with { type: 'json' }

export const APP_NAME = PKG.extra.productName
export const APP_VERSION = PKG.version
export const APP_ID = PKG.name
export const API_VERSION = 'v1'

export const APP_DESCRIPTION = PKG.description
export const APP_HOMEPAGE = PKG.homepage
export const APP_REPOSITORY = PKG.repository.url
export const APP_BUGS = PKG.bugs.url
export const APP_FUNDING = PKG.funding.url
export const APP_LICENSE = PKG.license

type PackageAuthor = string | { name?: string; email?: string; url?: string }
const packageAuthor = PKG.author as PackageAuthor
export const APP_AUTHOR =
  typeof packageAuthor === 'string' ? packageAuthor : (packageAuthor.name ?? '')
export const APP_AUTHOR_URL =
  typeof packageAuthor === 'string' ? APP_HOMEPAGE : (packageAuthor.url ?? APP_HOMEPAGE)
export const APP_AUTHOR_EMAIL = typeof packageAuthor === 'string' ? '' : (packageAuthor.email ?? '')

export const LOCALE_COOKIE = APP_ID + '_locale_mode'
export const THEME_COOKIE = APP_ID + '_theme'
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const DEFAULT_LOCALE_MODE = 'auto' as const
export const DEFAULT_THEME = 'system' as const

/** Maximum number of records rendered per page before loading more on scroll. */
export const PAGE_SIZE = 20

export const THEME_COLOR_LIGHT = '#f2f4f7'
export const THEME_COLOR_DARK = '#07080a'
