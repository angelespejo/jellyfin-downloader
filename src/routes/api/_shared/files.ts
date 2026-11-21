import path from 'node:path'
import type { AudioCodec, Container } from '#lib/types.js'

// oxlint-disable-next-line no-control-regex
const RESERVED = /[<>:"/\\|?*\u0000-\u001f\u007f]/g

export function sanitizeFilenamePart(value: string, maxLength = 90): string {
  const cleaned = value
    .normalize('NFC')
    .replace(RESERVED, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, maxLength)
    .trim()
  return cleaned || 'file'
}

export function sanitizeDownloadName(value: string, fallback = 'descarga'): string {
  const base = sanitizeFilenamePart(value, 140)
  return base || fallback
}

export function encodeContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(filename).replace(
    /['()]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

export function isInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  return (
    resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  )
}

export function safeJoin(root: string, ...parts: string[]): string {
  const joined = path.resolve(root, ...parts)
  if (!isInside(root, joined)) {
    throw new Error('Ruta fuera del directorio permitido')
  }
  return joined
}

export function containerExtension(container: Container): string {
  return container === 'mkv' ? 'mkv' : container === 'mp4' ? 'mp4' : 'webm'
}

export function audioExtension(codec: AudioCodec): string {
  switch (codec) {
    case 'aac':
      return 'm4a'
    case 'ac3':
      return 'ac3'
    case 'eac3':
      return 'eac3'
    case 'opus':
      return 'opus'
    case 'flac':
      return 'flac'
    case 'mp3':
      return 'mp3'
    default:
      return 'mka'
  }
}

export function sourceAudioExtension(codec: string): string {
  const normalized = codec.toLowerCase()
  if (['aac', 'alac'].includes(normalized)) return 'm4a'
  if (normalized === 'ac3') return 'ac3'
  if (normalized === 'eac3') return 'eac3'
  if (['opus', 'vorbis'].includes(normalized)) return normalized === 'opus' ? 'opus' : 'ogg'
  if (['flac'].includes(normalized)) return 'flac'
  if (['mp3', 'mp2'].includes(normalized)) return 'mp3'
  if (['dts', 'truehd', 'mlp'].includes(normalized)) return normalized
  return 'mka'
}

export function contentTypeForExtension(extension: string): string {
  const ext = extension.toLowerCase()
  const map: Record<string, string> = {
    mkv: 'video/x-matroska',
    mp4: 'video/mp4',
    webm: 'video/webm',
    zip: 'application/zip',
    srt: 'application/x-subrip; charset=utf-8',
    vtt: 'text/vtt; charset=utf-8',
    ass: 'text/x-ssa; charset=utf-8',
    ssa: 'text/x-ssa; charset=utf-8',
    sup: 'application/octet-stream',
    sub: 'application/octet-stream',
    m4a: 'audio/mp4',
    ac3: 'audio/ac3',
    eac3: 'audio/eac3',
    opus: 'audio/ogg',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    mp3: 'audio/mpeg',
    mka: 'audio/x-matroska',
    dts: 'audio/vnd.dts',
    truehd: 'audio/truehd',
    mlp: 'audio/mlp',
  }
  return map[ext] ?? 'application/octet-stream'
}

export interface ByteRange {
  start: number
  end: number
}

export function parseRangeHeader(value: string | null, size: number): ByteRange | null | 'invalid' {
  if (!value) return null
  const match = value.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return 'invalid'
  const startRaw = match[1] ?? ''
  const endRaw = match[2] ?? ''
  if (!startRaw && !endRaw) return 'invalid'

  let start: number
  let end: number
  if (!startRaw) {
    const suffix = Number(endRaw)
    if (!Number.isInteger(suffix) || suffix <= 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startRaw)
    end = endRaw ? Number(endRaw) : size - 1
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end)
      return 'invalid'
    if (start >= size) return 'invalid'
    end = Math.min(end, size - 1)
  }
  return { start, end }
}
