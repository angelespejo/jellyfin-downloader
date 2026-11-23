import { error, redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getConfig } from '#api/_shared/config.js'
import { jellyfinWebUrl } from '#api/_shared/jellyfin-links.js'

const ITEM_ID = /^[0-9a-fA-F]{32}$/

export const GET: RequestHandler = ({ params }) => {
  if (!ITEM_ID.test(params.id)) throw error(400, 'Invalid item id')
  let base: string
  try {
    base = getConfig().jellyfinPublicUrl
  } catch {
    throw error(503, 'Jellyfin is not configured')
  }
  throw redirect(302, jellyfinWebUrl(base, params.id), { external: true })
}
