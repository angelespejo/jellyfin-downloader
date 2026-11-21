export const DEFAULT_PRESET_TAG = 'default'
export const PRESET_TAGS_MAX = 20
export const PRESET_TAG_MAX_LENGTH = 32

export class PresetTagError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PresetTagError'
  }
}

export function slugifyPresetTag(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PRESET_TAG_MAX_LENGTH)
}

export function normalizePresetTags(value: unknown): string[] {
  if (value === undefined || value === null) return [DEFAULT_PRESET_TAG]
  if (!Array.isArray(value)) {
    throw new PresetTagError('tags must be an array')
  }
  const tags: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') {
      throw new PresetTagError('each tag must be a string')
    }
    const tag = slugifyPresetTag(raw)
    if (tag && !tags.includes(tag)) tags.push(tag)
  }
  if (tags.length > PRESET_TAGS_MAX) {
    throw new PresetTagError(`Too many preset tags (maximum ${PRESET_TAGS_MAX})`)
  }
  return tags.length ? tags : [DEFAULT_PRESET_TAG]
}

export function parsePresetTagInput(value: string): string[] {
  return normalizePresetTags(value.split(','))
}

export function formatPresetTags(tags: readonly string[]): string {
  return tags.join(', ')
}
