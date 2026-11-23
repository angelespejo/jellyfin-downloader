/** Builds the Jellyfin web details URL for an item, keeping the server base path. */
export function jellyfinWebUrl(base: string, itemId: string): string {
  const normalized = base.endsWith('/') ? base : `${base}/`
  const url = new URL('web/index.html', normalized)
  url.hash = `!/details?id=${encodeURIComponent(itemId)}`
  return url.toString()
}
