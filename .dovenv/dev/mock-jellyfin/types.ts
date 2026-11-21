export interface MockStream {
  index: number
  type: 'Video' | 'Audio' | 'Subtitle'
  codec: string
  language?: string
  title?: string
  displayTitle?: string
  width?: number
  height?: number
  channels?: number
  bitrate?: number
  isDefault?: boolean
  isForced?: boolean
  isExternal?: boolean
  isTextSubtitleStream?: boolean
  /** Path relative to .dovenv/dev/fixtures for external subtitles. */
  deliveryPath?: string
}

export interface MockSource {
  id: string
  name: string
  container: string
  /** Path relative to .dovenv/dev/fixtures. */
  path: string
  size: number
  etag: string
  runtimeTicks: number
  streams: MockStream[]
}

export interface MockMovie {
  id: string
  name: string
  year: number
  overview: string
  /** Path relative to .dovenv/dev/fixtures. */
  posterPath: string
  posterTag: string
  type?: 'Movie' | 'Series' | 'Video' | 'Episode'
  seriesId?: string
  seriesName?: string
  seasonNumber?: number
  episodeNumber?: number
  childCount?: number
  sources: MockSource[]
}

export interface MockManifest {
  generatedAt: string
  movies: MockMovie[]
}
