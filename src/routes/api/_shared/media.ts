import {
  CONTAINERS,
  type AudioStreamInfo,
  type Container,
  type MediaKind,
  type MediaSourceInfo,
  type MovieDetail,
  type MovieSummary,
  type SeriesDetail,
  type SubtitleStreamInfo,
  type VideoStreamInfo,
} from '#lib/types.js'
import type { JellyfinItem, JellyfinMediaSource, JellyfinMediaStream } from './jellyfin-types.js'
import { JellyfinError } from './jellyfin-error.js'

const TEXT_SUBTITLE_CODECS = new Set([
  'subrip',
  'srt',
  'ass',
  'ssa',
  'webvtt',
  'vtt',
  'mov_text',
  'text',
  'eia_608',
  'ttml',
])

const SUBTITLE_FORMATS: Record<string, string> = {
  subrip: 'srt',
  srt: 'srt',
  ass: 'ass',
  ssa: 'ass',
  webvtt: 'vtt',
  vtt: 'vtt',
  mov_text: 'srt',
  text: 'srt',
  pgssub: 'sup',
  hdmv_pgs_subtitle: 'sup',
  dvdsub: 'sub',
  dvb_subtitle: 'sub',
  ttml: 'ttml',
}

export interface InternalSubtitleStream extends SubtitleStreamInfo {
  deliveryUrl: string | null
  path: string | null
}

export interface InternalMediaSource extends Omit<MediaSourceInfo, 'subtitles'> {
  etag: string | null
  path: string | null
  subtitles: InternalSubtitleStream[]
}

export function normalizeContainer(value: string | undefined | null): string {
  const container = (value ?? '').toLowerCase().trim()
  if (container === 'matroska') return 'mkv'
  if (container === 'm4v') return 'mp4'
  return container || 'mkv'
}

export function defaultContainerFor(sourceContainer: string): Container {
  return (CONTAINERS as readonly string[]).includes(sourceContainer)
    ? (sourceContainer as Container)
    : 'mkv'
}

export function subtitleFormat(codec: string | undefined): string {
  return SUBTITLE_FORMATS[(codec ?? '').toLowerCase()] ?? 'srt'
}

export function isTextSubtitle(stream: JellyfinMediaStream): boolean {
  if (typeof stream.IsTextSubtitleStream === 'boolean') return stream.IsTextSubtitleStream
  return TEXT_SUBTITLE_CODECS.has((stream.Codec ?? '').toLowerCase())
}

function normalizeVideo(stream: JellyfinMediaStream): VideoStreamInfo {
  return {
    index: stream.Index ?? 0,
    codec: (stream.Codec ?? 'desconocido').toLowerCase(),
    width: stream.Width ?? null,
    height: stream.Height ?? null,
    bitrate: stream.BitRate ?? null,
    isDefault: Boolean(stream.IsDefault),
    title: stream.Title ?? null,
    language: stream.Language ?? null,
  }
}

function normalizeAudio(stream: JellyfinMediaStream): AudioStreamInfo {
  return {
    index: stream.Index ?? 0,
    codec: (stream.Codec ?? 'desconocido').toLowerCase(),
    channels: stream.Channels ?? null,
    bitrate: stream.BitRate ?? null,
    language: stream.Language ?? null,
    title: stream.Title ?? null,
    displayTitle: stream.DisplayTitle ?? null,
    isDefault: Boolean(stream.IsDefault),
    isForced: Boolean(stream.IsForced),
  }
}

function normalizeSubtitle(stream: JellyfinMediaStream): InternalSubtitleStream {
  const codec = (stream.Codec ?? 'desconocido').toLowerCase()
  return {
    index: stream.Index ?? 0,
    codec,
    format: subtitleFormat(codec),
    isExternal: Boolean(stream.IsExternal),
    isText: isTextSubtitle(stream),
    language: stream.Language ?? null,
    title: stream.Title ?? null,
    displayTitle: stream.DisplayTitle ?? null,
    isDefault: Boolean(stream.IsDefault),
    isForced: Boolean(stream.IsForced),
    deliveryUrl: stream.DeliveryUrl ?? null,
    path: null,
  }
}

export function normalizeMediaSource(
  source: JellyfinMediaSource,
  fallbackId: string
): InternalMediaSource {
  const streams = source.MediaStreams ?? []
  const videos = streams
    .filter((stream) => stream.Type === 'Video')
    .sort((a, b) => (a.Index ?? 0) - (b.Index ?? 0))
    .map(normalizeVideo)
  const audio = streams
    .filter((stream) => stream.Type === 'Audio')
    .sort((a, b) => (a.Index ?? 0) - (b.Index ?? 0))
    .map(normalizeAudio)
  const subtitles = streams
    .filter((stream) => stream.Type === 'Subtitle')
    .sort((a, b) => (a.Index ?? 0) - (b.Index ?? 0))
    .map(normalizeSubtitle)

  return {
    id: source.Id ?? fallbackId,
    name: source.Name ?? 'Main version',
    container: normalizeContainer(source.Container),
    sizeBytes: source.Size ?? null,
    bitrate: source.Bitrate ?? null,
    runtimeTicks: source.RunTimeTicks ?? null,
    etag: source.ETag ?? null,
    path: source.Path ?? null,
    video: videos,
    audio,
    subtitles,
  }
}

export function getMovieSources(item: JellyfinItem): InternalMediaSource[] {
  return (item.MediaSources ?? []).map((source) => normalizeMediaSource(source, item.Id))
}

export function getMovieSource(item: JellyfinItem, mediaSourceId?: string): InternalMediaSource {
  const sources = getMovieSources(item)
  if (sources.length === 0) throw new JellyfinError('The movie has no media sources', 422)
  if (!mediaSourceId) {
    const preferred = sources.find((source) => source.video.length > 0) ?? sources[0]
    if (!preferred) throw new JellyfinError('The movie has no media sources', 422)
    return preferred
  }
  const source = sources.find((candidate) => candidate.id === mediaSourceId)
  if (!source) throw new JellyfinError('The media source does not belong to this movie', 400)
  return source
}

export function imageTag(item: JellyfinItem): string | null {
  return item.ImageTags?.Primary ?? null
}

export function mediaKind(item: JellyfinItem): MediaKind {
  if (item.Type === 'Series') return 'series'
  if (item.Type === 'Episode') return 'episode'
  if (item.Type === 'Video') return 'homevideo'
  return 'movie'
}

export function episodeCode(item: JellyfinItem): string | null {
  if (mediaKind(item) !== 'episode') return null
  const season = item.ParentIndexNumber
  const episode = item.IndexNumber
  if (season === undefined && episode === undefined) return null
  const seasonText = String(season ?? 0).padStart(2, '0')
  const episodeText = String(episode ?? 0).padStart(2, '0')
  return `S${seasonText}E${episodeText}`
}

export function mediaDisplayTitle(item: JellyfinItem): string {
  if (mediaKind(item) !== 'episode') return item.Name
  const code = episodeCode(item)
  const series = item.SeriesName ?? item.Name
  return code ? `${series} ${code} - ${item.Name}` : `${series} - ${item.Name}`
}

function itemMetadata(
  item: JellyfinItem
): Pick<MovieSummary, 'kind' | 'seriesId' | 'seriesName' | 'seasonNumber' | 'episodeNumber'> {
  return {
    kind: mediaKind(item),
    seriesId: item.SeriesId ?? null,
    seriesName: item.SeriesName ?? null,
    seasonNumber: item.ParentIndexNumber ?? null,
    episodeNumber: item.IndexNumber ?? null,
  }
}

export function runtimeSeconds(ticks: number | undefined | null): number | null {
  if (!ticks || ticks <= 0) return null
  return ticks / 10_000_000
}

export function sourceFingerprint(source: InternalMediaSource): string {
  return [
    source.etag ?? '',
    source.sizeBytes ?? '',
    source.runtimeTicks ?? '',
    source.container,
  ].join(':')
}

export function sourceMaxHeight(source: InternalMediaSource): number | null {
  const heights = source.video
    .map((stream) => stream.height)
    .filter((height): height is number => !!height)
  return heights.length ? Math.max(...heights) : null
}

export function audioOrdinal(source: InternalMediaSource, index: number): number {
  return source.audio.findIndex((stream) => stream.index === index)
}

export function embeddedSubtitleOrdinal(source: InternalMediaSource, index: number): number {
  const embedded = source.subtitles.filter((stream) => !stream.isExternal)
  return embedded.findIndex((stream) => stream.index === index)
}

export function toMovieSummary(item: JellyfinItem, downloadCount = 0): MovieSummary {
  const sources = getMovieSources(item)
  const source = sources[0] ?? null
  const maxHeight = source ? sourceMaxHeight(source) : null
  const videoCodec = source?.video[0]?.codec ?? null
  const kind = mediaKind(item)
  return {
    id: item.Id,
    title: item.Name,
    year: item.ProductionYear ?? null,
    runtimeSeconds: runtimeSeconds(item.RunTimeTicks),
    imageTag: imageTag(item),
    media: source
      ? {
          maxHeight,
          container: source.container,
          videoCodec,
          audioLanguages: [...new Set(source.audio.map((stream) => stream.language ?? 'und'))],
          subtitleCount: source.subtitles.length,
          sizeBytes: source.sizeBytes,
        }
      : null,
    downloadCount,
    ...itemMetadata(item),
    ...(kind === 'series' && item.ChildCount !== undefined
      ? { episodeCount: item.ChildCount }
      : {}),
  }
}

export function toMovieDetail(item: JellyfinItem): MovieDetail {
  const sources = getMovieSources(item)
  const first = sources[0] ?? null
  return {
    id: item.Id,
    title: item.Name,
    year: item.ProductionYear ?? null,
    runtimeSeconds: runtimeSeconds(item.RunTimeTicks),
    overview: item.Overview ?? null,
    imageTag: imageTag(item),
    defaultContainer: first ? defaultContainerFor(first.container) : 'mkv',
    sources: sources.map(toPublicSource),
    ...itemMetadata(item),
  }
}

export function toSeriesDetail(
  item: JellyfinItem,
  episodes: JellyfinItem[],
  counts: Map<string, number>
): SeriesDetail {
  const summaries = episodes.map((episode) => toMovieSummary(episode, counts.get(episode.Id) ?? 0))
  const totalSizeBytes = summaries.reduce((total, episode) => {
    const size = episode.media?.sizeBytes ?? 0
    return size > 0 ? total + size : total
  }, 0)
  return {
    id: item.Id,
    title: item.Name,
    year: item.ProductionYear ?? null,
    overview: item.Overview ?? null,
    imageTag: imageTag(item),
    kind: 'series',
    totalSizeBytes: totalSizeBytes > 0 ? totalSizeBytes : null,
    episodes: summaries,
  }
}

export function toPublicSource(source: InternalMediaSource): MediaSourceInfo {
  return {
    id: source.id,
    name: source.name,
    container: source.container,
    sizeBytes: source.sizeBytes,
    bitrate: source.bitrate,
    runtimeTicks: source.runtimeTicks,
    video: source.video,
    audio: source.audio,
    subtitles: source.subtitles.map(
      ({ deliveryUrl: _deliveryUrl, path: _path, ...stream }): SubtitleStreamInfo => stream
    ),
  }
}
