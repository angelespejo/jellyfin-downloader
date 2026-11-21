import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { MockManifest, MockMovie, MockSource, MockStream } from './types.ts'

const fixtureRoot = path.join(process.cwd(), '.dovenv', 'dev', 'fixtures')
const manifestPath = path.join(fixtureRoot, 'manifest.json')

function contentType(file: string): string {
  const extension = path.extname(file).toLowerCase()
  const types: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.srt': 'application/x-subrip; charset=utf-8',
    '.vtt': 'text/vtt; charset=utf-8',
    '.ass': 'text/x-ssa; charset=utf-8',
  }
  return types[extension] ?? 'application/octet-stream'
}

function fixturePath(relative: string): string {
  const resolved = path.resolve(fixtureRoot, relative)
  if (!resolved.startsWith(`${fixtureRoot}${path.sep}`)) throw new Error('Invalid fixture path')
  return resolved
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  })
  res.end(data)
}

function parseRange(
  value: string | undefined,
  size: number
): { start: number; end: number } | null | 'invalid' {
  if (!value) return null
  const match = value.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return 'invalid'
  const startText = match[1] ?? ''
  const endText = match[2] ?? ''
  if (!startText && !endText) return 'invalid'
  if (!startText) {
    const suffix = Number(endText)
    if (!Number.isInteger(suffix) || suffix <= 0) return 'invalid'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(startText)
  const end = endText ? Number(endText) : size - 1
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  )
    return 'invalid'
  return { start, end: Math.min(end, size - 1) }
}

async function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  downloadName?: string
): Promise<void> {
  let info
  try {
    info = await stat(file)
  } catch {
    json(res, 404, { error: 'not found' })
    return
  }
  if (!info.isFile()) {
    json(res, 404, { error: 'not found' })
    return
  }
  const range = parseRange(req.headers.range, info.size)
  const headers: Record<string, string | number> = {
    'Content-Type': contentType(file),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=60',
  }
  if (downloadName)
    headers['Content-Disposition'] = `attachment; filename="${downloadName.replace(/["\\]/g, '_')}"`

  if (range === 'invalid') {
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` })
    res.end()
    return
  }
  if (!range) {
    headers['Content-Length'] = info.size
    res.writeHead(200, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(file).pipe(res)
    return
  }
  headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`
  headers['Content-Length'] = range.end - range.start + 1
  res.writeHead(206, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file, { start: range.start, end: range.end }).pipe(res)
}

function streamToJellyfin(
  movie: MockMovie,
  source: MockSource,
  stream: MockStream
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    Index: stream.index,
    Type: stream.type,
    Codec: stream.codec,
    Language: stream.language,
    Title: stream.title,
    DisplayTitle: stream.displayTitle,
    Width: stream.width,
    Height: stream.height,
    Channels: stream.channels,
    BitRate: stream.bitrate,
    IsDefault: stream.isDefault ?? false,
    IsForced: stream.isForced ?? false,
  }
  if (stream.type === 'Subtitle') {
    base.IsExternal = stream.isExternal ?? false
    base.IsTextSubtitleStream = stream.isTextSubtitleStream ?? true
    base.SupportsExternalStream = stream.isExternal ?? false
    if (stream.isExternal) {
      const extension = path.extname(stream.deliveryPath ?? '').slice(1) || 'srt'
      base.DeliveryUrl = `/Videos/${movie.id}/${source.id}/Subtitles/${stream.index}/Stream.${extension}`
      base.Path = stream.deliveryPath
    }
  }
  return base
}

function toJellyfinItem(movie: MockMovie): Record<string, unknown> {
  return {
    Id: movie.id,
    Name: movie.name,
    Type: movie.type ?? 'Movie',
    ProductionYear: movie.year,
    Overview: movie.overview,
    RunTimeTicks: movie.sources[0]?.runtimeTicks,
    ImageTags: { Primary: movie.posterTag },
    PrimaryImageAspectRatio: 2 / 3,
    SeriesId: movie.seriesId,
    SeriesName: movie.seriesName,
    ParentIndexNumber: movie.seasonNumber,
    IndexNumber: movie.episodeNumber,
    ChildCount: movie.childCount,
    MediaSources: movie.sources.map((source) => ({
      Id: source.id,
      Name: source.name,
      Container: source.container,
      Size: source.size,
      ETag: source.etag,
      RunTimeTicks: source.runtimeTicks,
      Path: source.path,
      MediaStreams: source.streams.map((stream) => streamToJellyfin(movie, source, stream)),
    })),
  }
}

function withCatalogExtras(items: MockMovie[]): MockMovie[] {
  if (items.some((item) => item.type === 'Series')) return items
  const general = items[0]
  const friday = items[1]
  const night = items[2]
  if (!general || !friday) return items
  const seriesId = '44444444444444444444444444444444'
  const series: MockMovie = {
    id: seriesId,
    name: 'Public Domain Matinee',
    year: 1926,
    overview: 'Development series used to test episode browsing and downloads.',
    posterPath: general.posterPath,
    posterTag: general.posterTag,
    type: 'Series',
    childCount: 2,
    sources: [],
  }
  const episodeOne: MockMovie = {
    ...structuredClone(general),
    id: '55555555555555555555555555555555',
    name: 'The General',
    type: 'Episode',
    seriesId,
    seriesName: series.name,
    seasonNumber: 1,
    episodeNumber: 1,
    overview: 'First development episode.',
  }
  const episodeTwo: MockMovie = {
    ...structuredClone(friday),
    id: '66666666666666666666666666666666',
    name: 'His Girl Friday',
    type: 'Episode',
    seriesId,
    seriesName: series.name,
    seasonNumber: 1,
    episodeNumber: 2,
    overview: 'Second development episode.',
  }
  const homeVideo: MockMovie | null = night
    ? {
        ...structuredClone(night),
        id: '77777777777777777777777777777777',
        name: 'Garden Home Video',
        type: 'Video',
        overview: 'Home video used to test the Video item type.',
      }
    : null
  return [...items, series, episodeOne, episodeTwo, ...(homeVideo ? [homeVideo] : [])]
}

function authorized(req: IncomingMessage, apiKey: string): boolean {
  const header = req.headers.authorization
  if (header) {
    const match = header.match(/^(?:MediaBrowser|Bearer)\s+Token="?([^"]+)"?$/i)
    if (match?.[1] === apiKey) return true
  }
  return req.headers['x-emby-token'] === apiKey
}

export async function startMockJellyfin(): Promise<Server> {
  const apiKey = process.env.MOCK_API_KEY ?? 'dev-key'
  const port = Number(process.env.MOCK_JELLYFIN_PORT ?? 8096)
  const host = process.env.MOCK_JELLYFIN_HOST ?? '127.0.0.1'

  let manifest: MockManifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as MockManifest
  } catch {
    throw new Error('Fixtures are missing. Run "pnpm mock:fetch" before starting the mock.')
  }
  const movies = new Map(withCatalogExtras(manifest.movies).map((movie) => [movie.id, movie]))

  const server = createServer(async (req, res) => {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const pathname = url.pathname

    if (pathname === '/System/Info/Public') {
      json(res, 200, {
        ServerName: 'Mock Jellyfin',
        Version: '10.10.0-mock',
        ProductName: 'Jellyfin Server',
      })
      return
    }

    if (!authorized(req, apiKey)) {
      json(res, 401, { error: 'unauthorized' })
      return
    }

    if (pathname === '/Items' && (method === 'GET' || method === 'HEAD')) {
      const search = (url.searchParams.get('SearchTerm') ?? '').toLowerCase()
      const start = Math.max(0, Number(url.searchParams.get('StartIndex') ?? 0) || 0)
      const limit = Math.max(1, Number(url.searchParams.get('Limit') ?? 100) || 100)
      const requestedTypes = (url.searchParams.get('IncludeItemTypes') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      const all = [...movies.values()]
        .filter((movie) => {
          const type = movie.type ?? 'Movie'
          return requestedTypes.length === 0 || requestedTypes.includes(type)
        })
        .filter(
          (movie) =>
            !search ||
            movie.name.toLowerCase().includes(search) ||
            movie.seriesName?.toLowerCase().includes(search)
        )
        .map((movie) => toJellyfinItem(movie))
      const page = all.slice(start, start + limit)
      json(res, 200, { Items: page, TotalRecordCount: all.length, StartIndex: start })
      return
    }

    const episodesMatch = pathname.match(/^\/Shows\/([0-9a-f]{32})\/Episodes$/)
    if (episodesMatch && (method === 'GET' || method === 'HEAD')) {
      const seriesId = episodesMatch[1] ?? ''
      const search = (url.searchParams.get('SearchTerm') ?? '').toLowerCase()
      const start = Math.max(0, Number(url.searchParams.get('StartIndex') ?? 0) || 0)
      const limit = Math.max(1, Number(url.searchParams.get('Limit') ?? 100) || 100)
      const all = [...movies.values()]
        .filter((movie) => movie.type === 'Episode' && movie.seriesId === seriesId)
        .filter((movie) => !search || movie.name.toLowerCase().includes(search))
        .sort(
          (a, b) =>
            (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) ||
            (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)
        )
        .map((movie) => toJellyfinItem(movie))
      const page = all.slice(start, start + limit)
      json(res, 200, { Items: page, TotalRecordCount: all.length, StartIndex: start })
      return
    }

    const imageMatch = pathname.match(/^\/Items\/([0-9a-f]{32})\/Images\/Primary$/)
    if (imageMatch && (method === 'GET' || method === 'HEAD')) {
      const movie = movies.get(imageMatch[1] ?? '')
      if (!movie) return json(res, 404, { error: 'not found' })
      return serveFile(req, res, fixturePath(movie.posterPath))
    }

    const downloadMatch = pathname.match(/^\/Items\/([0-9a-f]{32})\/Download$/)
    if (downloadMatch && (method === 'GET' || method === 'HEAD')) {
      const movie = movies.get(downloadMatch[1] ?? '')
      const source = movie?.sources[0]
      if (!movie || !source) return json(res, 404, { error: 'not found' })
      const delay = Number(process.env.MOCK_STREAM_DELAY_MS ?? 0)
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
      return serveFile(req, res, fixturePath(source.path), `${movie.name}.${source.container}`)
    }

    const itemMatch = pathname.match(/^\/Items\/([0-9a-f]{32})$/)
    if (itemMatch && method === 'GET') {
      const movie = movies.get(itemMatch[1] ?? '')
      if (!movie) return json(res, 404, { error: 'not found' })
      return json(res, 200, toJellyfinItem(movie))
    }

    const streamMatch = pathname.match(/^\/Videos\/([0-9a-f]{32})\/stream$/)
    if (streamMatch && (method === 'GET' || method === 'HEAD')) {
      const movie = movies.get(streamMatch[1] ?? '')
      const sourceId = url.searchParams.get('mediaSourceId')
      const source =
        movie?.sources.find((candidate) => candidate.id === sourceId) ?? movie?.sources[0]
      if (!movie || !source) return json(res, 404, { error: 'not found' })
      const delay = Number(process.env.MOCK_STREAM_DELAY_MS ?? 0)
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
      return serveFile(req, res, fixturePath(source.path), `${movie.name}.${source.container}`)
    }

    const subtitleMatch = pathname.match(
      /^\/Videos\/([0-9a-f]{32})\/([A-Za-z0-9_-]+)\/Subtitles\/(\d+)\/Stream\.[a-z0-9]+$/
    )
    if (subtitleMatch && (method === 'GET' || method === 'HEAD')) {
      const movie = movies.get(subtitleMatch[1] ?? '')
      const source = movie?.sources.find((candidate) => candidate.id === subtitleMatch[2])
      const index = Number(subtitleMatch[3])
      const stream = source?.streams.find(
        (candidate) => candidate.index === index && candidate.isExternal
      )
      if (!stream?.deliveryPath) return json(res, 404, { error: 'subtitle not found' })
      return serveFile(req, res, fixturePath(stream.deliveryPath))
    }

    json(res, 404, { error: 'not found' })
  })

  await new Promise<void>((resolve) => server.listen(port, host, resolve))
  console.log(`Mock Jellyfin listening on http://${host}:${port} (API key: ${apiKey})`)
  return server
}
