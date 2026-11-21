import type { RequestHandler } from './$types'
import { apiRoute, jsonResponse } from '#api/_shared/api.js'
import { getSettingsStore } from '#api/_shared/settings.js'
import { slugifyPresetTag } from '#lib/presets.js'

function requestedTags(url: URL): string[] | null {
  const raw = url.searchParams
    .getAll('tag')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
  const tags: string[] = []
  for (const value of raw) {
    const tag = slugifyPresetTag(value)
    if (!tag) return null
    if (!tags.includes(tag)) tags.push(tag)
  }
  return tags
}

export const GET: RequestHandler = apiRoute(async ({ url }) => {
  const tags = requestedTags(url)
  if (tags === null) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'Invalid preset tag' } }, 400)
  }
  const { document, warning } = await getSettingsStore().getWithWarning()
  const presets = tags.length
    ? document.presets.filter((preset) => tags.every((tag) => preset.tags.includes(tag)))
    : document.presets
  const availableTags = [...new Set(document.presets.flatMap((preset) => preset.tags))].sort()
  return jsonResponse({
    presets,
    total: presets.length,
    tags: availableTags,
    warning,
  })
})
