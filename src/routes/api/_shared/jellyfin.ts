import { getConfig } from './config'
import type {
  JellyfinItem,
  JellyfinItemsResult,
  JellyfinMediaSource,
  JellyfinMediaStream,
  JellyfinSystemInfo,
} from './jellyfin-types'
import { JellyfinError } from './jellyfin-error'
import { pickJellyfinUser, type JellyfinUser } from './jellyfin-user'

export { JellyfinError } from './jellyfin-error'

const ITEM_ID = /^[0-9a-fA-F]{32}$/

export function isValidJellyfinId(value: string): boolean {
  return ITEM_ID.test(value)
}

interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
  accept?: string
  /** null desactiva el timeout (descargas de medios) */
  timeoutMs?: number | null
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const LIST_CACHE_MS = 5 * 60 * 1000
const DETAIL_CACHE_MS = 60 * 1000

export interface SeriesEpisodesResult {
  items: JellyfinItem[]
  unavailable: number
}

class JellyfinClient {
  private readonly base: string
  private readonly apiKey: string
  private userId: string | null | undefined = undefined
  private userPromise: Promise<string | null> | null = null
  private listCache: CacheEntry<JellyfinItem[]> | null = null
  private listPromise: Promise<JellyfinItem[]> | null = null
  private readonly detailCache = new Map<string, CacheEntry<JellyfinItem>>()
  private readonly episodesCache = new Map<string, CacheEntry<SeriesEpisodesResult>>()
  private readonly episodesPromise = new Map<string, Promise<SeriesEpisodesResult>>()
  private readonly seriesSizeCache = new Map<string, CacheEntry<number>>()

  constructor(base: string, apiKey: string) {
    this.base = base.endsWith('/') ? base : `${base}/`
    this.apiKey = apiKey
  }

  private buildUrl(
    pathname: string,
    params?: Record<string, string | number | boolean | undefined>
  ): URL {
    const relative = pathname.replace(/^\/+/, '')
    const url = new URL(relative, this.base)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value))
      }
    }
    return url
  }

  private authHeaders(accept: string): Headers {
    const headers = new Headers()
    headers.set('Authorization', `MediaBrowser Token="${this.apiKey}"`)
    headers.set('Accept', accept)
    return headers
  }

  private async fetchWithRedirects(
    url: URL,
    accept: string,
    signal: AbortSignal | undefined,
    timeoutMs: number | null
  ): Promise<Response> {
    let current = url
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const timeoutSignal = timeoutMs ? AbortSignal.timeout(timeoutMs) : null
      const combined =
        signal && timeoutSignal
          ? AbortSignal.any([signal, timeoutSignal])
          : (signal ?? timeoutSignal ?? undefined)
      let response: Response
      try {
        response = await fetch(current, {
          method: 'GET',
          headers: this.authHeaders(accept),
          redirect: 'manual',
          signal: combined,
        })
      } catch (error) {
        if (signal?.aborted) throw error
        throw new JellyfinError('Could not connect to Jellyfin', 502)
      }

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return response
      }

      const location = response.headers.get('location')
      if (!location) return response

      const next = new URL(location, current)
      if (next.origin !== new URL(this.base).origin) {
        throw new JellyfinError('Jellyfin returned a redirect to a disallowed origin', 502)
      }
      current = next
    }
    throw new JellyfinError('Too many redirects from Jellyfin', 502)
  }

  async request(pathname: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.buildUrl(pathname, options.params)
    const timeoutMs = options.timeoutMs === undefined ? 15_000 : options.timeoutMs
    const response = await this.fetchWithRedirects(
      url,
      options.accept ?? 'application/json',
      options.signal,
      timeoutMs
    )
    if (!response.ok) {
      if (response.status === 404) {
        throw new JellyfinError('The movie does not exist in Jellyfin', 404)
      }
      const status = response.status === 401 || response.status === 403 ? response.status : 502
      throw new JellyfinError(
        status === 401 || status === 403
          ? 'Jellyfin rejected the API key or access to this content'
          : `Jellyfin responded with HTTP ${response.status}`,
        status
      )
    }
    return response
  }

  private async requestJson<T>(pathname: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.request(pathname, options)
    try {
      return (await response.json()) as T
    } catch {
      throw new JellyfinError('Jellyfin returned invalid JSON', 502)
    }
  }

  /**
   * Jellyfin 12+ requires a `userId` on item detail requests. The API key has no
   * user context, so resolve one lazily and cache it. Failures do not break
   * Jellyfin 10.x servers, where the parameter is optional.
   */
  private async resolveUserId(): Promise<string | null> {
    if (this.userId !== undefined) return this.userId
    if (this.userPromise) return this.userPromise
    this.userPromise = this.requestJson<JellyfinUser[]>('/Users', { timeoutMs: 10_000 })
      .then((users) => {
        this.userId = pickJellyfinUser(users)
        return this.userId
      })
      .catch((error) => {
        if (error instanceof JellyfinError && (error.status === 401 || error.status === 403)) {
          this.userId = null
        }
        return null
      })
      .finally(() => {
        this.userPromise = null
      })
    return this.userPromise
  }

  async getSystemInfo(): Promise<JellyfinSystemInfo> {
    return this.requestJson<JellyfinSystemInfo>('/System/Info', { timeoutMs: 8_000 })
  }

  async listMovies(): Promise<JellyfinItem[]> {
    return this.listCatalog()
  }

  async listCatalog(): Promise<JellyfinItem[]> {
    if (this.listCache && this.listCache.expiresAt > Date.now()) return this.listCache.value
    if (this.listPromise) return this.listPromise

    this.listPromise = this.fetchAllItems('Movie,Video,Series')
      .then((items) => {
        this.listCache = { value: items, expiresAt: Date.now() + LIST_CACHE_MS }
        return items
      })
      .finally(() => {
        this.listPromise = null
      })
    return this.listPromise
  }

  private async fetchAllItems(includeItemTypes: string): Promise<JellyfinItem[]> {
    const pageSize = 500
    const maxItems = 20_000
    const items: JellyfinItem[] = []
    for (let start = 0; start < maxItems; start += pageSize) {
      const result = await this.requestJson<JellyfinItemsResult>('/Items', {
        params: {
          Recursive: true,
          IncludeItemTypes: includeItemTypes,
          Fields:
            'Type,ProductionYear,RunTimeTicks,Overview,ImageTags,PrimaryImageAspectRatio,MediaSources,SeriesId,SeriesName,SeasonId,ParentIndexNumber,IndexNumber,ChildCount',
          SortBy: 'SortName',
          SortOrder: 'Ascending',
          EnableImages: true,
          ImageTypeLimit: 1,
          EnableImageTypes: 'Primary',
          EnableTotalRecordCount: true,
          Limit: pageSize,
          StartIndex: start,
        },
      })
      const page = result.Items ?? []
      items.push(...page)
      const total = result.TotalRecordCount ?? items.length
      if (page.length < pageSize || items.length >= total) break
    }
    return items
  }

  async getSeriesEpisodes(seriesId: string): Promise<SeriesEpisodesResult> {
    if (!isValidJellyfinId(seriesId)) throw new JellyfinError('Invalid series ID', 400)
    const cached = this.episodesCache.get(seriesId)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const pending = this.episodesPromise.get(seriesId)
    if (pending) return pending

    const promise = this.fetchSeriesEpisodes(seriesId)
      .then((result) => {
        this.episodesCache.set(seriesId, {
          value: result,
          expiresAt: Date.now() + LIST_CACHE_MS,
        })
        return result
      })
      .finally(() => {
        this.episodesPromise.delete(seriesId)
      })
    this.episodesPromise.set(seriesId, promise)
    return promise
  }

  private async fetchSeriesEpisodes(seriesId: string): Promise<SeriesEpisodesResult> {
    const pageSize = 500
    const maxItems = 20_000
    const userId = await this.resolveUserId()
    const items: JellyfinItem[] = []
    let unavailable = 0
    for (let start = 0; start < maxItems; start += pageSize) {
      const result = await this.requestJson<JellyfinItemsResult>(`/Shows/${seriesId}/Episodes`, {
        params: {
          Fields:
            'Type,ProductionYear,RunTimeTicks,SeriesId,SeriesName,SeasonId,ParentIndexNumber,IndexNumber,LocationType',
          EnableImages: false,
          EnableTotalRecordCount: true,
          Limit: pageSize,
          StartIndex: start,
          ...(userId ? { userId } : {}),
        },
      })
      const page = result.Items ?? []
      for (const episode of page) {
        if (episode.LocationType === 'Virtual') unavailable += 1
        else items.push(episode)
      }
      const total = result.TotalRecordCount ?? items.length + unavailable
      if (page.length < pageSize || items.length + unavailable >= total) break
    }
    return {
      items: items.sort((a, b) => {
        const season = (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0)
        return season !== 0 ? season : (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0)
      }),
      unavailable,
    }
  }

  async searchCatalog(
    query: string,
    limit: number,
    offset: number
  ): Promise<{ items: JellyfinItem[]; total: number }> {
    const params: Record<string, string | number | boolean> = {
      Recursive: true,
      IncludeItemTypes: 'Movie,Video,Series',
      SearchTerm: query,
      Fields: 'Type,ProductionYear,ImageTags,SeriesId,SeriesName,ChildCount',
      EnableImages: true,
      ImageTypeLimit: 1,
      EnableImageTypes: 'Primary',
      EnableTotalRecordCount: true,
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Limit: limit,
      StartIndex: offset,
    }
    if (/^\d{4}$/.test(query)) params.Years = query
    const result = await this.requestJson<JellyfinItemsResult>('/Items', { params })
    const items = result.Items ?? []
    return { items, total: result.TotalRecordCount ?? items.length }
  }

  async getSeriesSize(seriesId: string): Promise<number> {
    if (!isValidJellyfinId(seriesId)) throw new JellyfinError('Invalid series ID', 400)
    const cached = this.seriesSizeCache.get(seriesId)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const pageSize = 500
    const maxItems = 20_000
    const userId = await this.resolveUserId()
    let total = 0
    for (let start = 0; start < maxItems; start += pageSize) {
      const result = await this.requestJson<JellyfinItemsResult>(`/Shows/${seriesId}/Episodes`, {
        params: {
          Fields: 'MediaSources,LocationType',
          EnableImages: false,
          EnableTotalRecordCount: true,
          Limit: pageSize,
          StartIndex: start,
          ...(userId ? { userId } : {}),
        },
      })
      const page = result.Items ?? []
      for (const episode of page) {
        if (episode.LocationType === 'Virtual') continue
        const source = episode.MediaSources?.find((candidate) => candidate.Type !== 'Placeholder')
        if (source?.Size) total += source.Size
      }
      const recordTotal = result.TotalRecordCount ?? start + page.length
      if (page.length < pageSize || start + page.length >= recordTotal) break
    }
    this.seriesSizeCache.set(seriesId, { value: total, expiresAt: Date.now() + LIST_CACHE_MS })
    return total
  }

  async getMovie(id: string): Promise<JellyfinItem> {
    if (!isValidJellyfinId(id)) throw new JellyfinError('Invalid media ID', 400)
    const cached = this.detailCache.get(id)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    const userId = await this.resolveUserId()
    const item = await this.requestJson<JellyfinItem>(`/Items/${id}`, {
      params: {
        Fields:
          'Type,ProductionYear,RunTimeTicks,Overview,ImageTags,PrimaryImageAspectRatio,MediaSources,SeriesId,SeriesName,SeasonId,ParentIndexNumber,IndexNumber',
        ...(userId ? { userId } : {}),
      },
    })
    if (!item?.Id) throw new JellyfinError('Jellyfin did not return the requested item', 404)
    this.detailCache.set(id, { value: item, expiresAt: Date.now() + DETAIL_CACHE_MS })
    return item
  }

  async getImage(id: string, tag: string | null, width: number): Promise<Response> {
    if (!isValidJellyfinId(id)) throw new JellyfinError('Invalid image ID', 400)
    if (!Number.isInteger(width) || width < 16 || width > 1200) {
      throw new JellyfinError('Invalid image width', 400)
    }
    const safeTag = tag && /^[A-Za-z0-9_-]+$/.test(tag) ? tag : undefined
    const response = await this.request(`/Items/${id}/Images/Primary`, {
      params: { tag: safeTag, maxWidth: width, quality: 88 },
      accept: 'image/*',
      timeoutMs: 20_000,
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!/^image\/(jpeg|png|webp|gif)/i.test(contentType)) {
      throw new JellyfinError('Jellyfin returned a disallowed image type', 502)
    }
    return response
  }

  async getStream(itemId: string, mediaSourceId: string, signal?: AbortSignal): Promise<Response> {
    if (!isValidJellyfinId(itemId)) throw new JellyfinError('Invalid movie ID', 400)
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(mediaSourceId)) {
      throw new JellyfinError('Invalid source ID', 400)
    }
    return this.request(`/Videos/${itemId}/stream`, {
      params: { static: true, mediaSourceId },
      accept: '*/*',
      signal,
      timeoutMs: null,
    })
  }

  async getSubtitle(
    itemId: string,
    mediaSourceId: string,
    stream: JellyfinMediaStream,
    format: string
  ): Promise<Response> {
    if (!isValidJellyfinId(itemId)) throw new JellyfinError('Invalid movie ID', 400)
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(mediaSourceId)) {
      throw new JellyfinError('Invalid source ID', 400)
    }
    const index = stream.Index
    if (index === undefined || !Number.isInteger(index) || index < 0) {
      throw new JellyfinError('Invalid subtitle index', 400)
    }
    const safeFormat = /^[a-z0-9]{2,8}$/.test(format) ? format : 'srt'

    if (stream.DeliveryUrl) {
      const url = new URL(stream.DeliveryUrl, this.base)
      if (url.origin !== new URL(this.base).origin) {
        throw new JellyfinError('External subtitle has a disallowed origin', 502)
      }
      url.searchParams.delete('api_key')
      const response = await this.fetchWithRedirects(url, '*/*', undefined, 20_000)
      if (!response.ok) {
        throw new JellyfinError(
          response.status === 401 || response.status === 403
            ? 'Jellyfin rejected access to the subtitle'
            : `Jellyfin responded with HTTP ${response.status} while downloading the subtitle`,
          502
        )
      }
      return response
    }

    return this.request(
      `/Videos/${itemId}/${mediaSourceId}/Subtitles/${index}/Stream.${safeFormat}`,
      { accept: '*/*', timeoutMs: 20_000 }
    )
  }

  async getSourceById(itemId: string, mediaSourceId: string): Promise<JellyfinMediaSource> {
    const movie = await this.getMovie(itemId)
    const source = (movie.MediaSources ?? []).find((candidate) => candidate.Id === mediaSourceId)
    if (!source) throw new JellyfinError('The media source does not belong to this movie', 400)
    return source
  }
}

let client: JellyfinClient | null = null

export function getJellyfinClient(): JellyfinClient {
  if (!client) {
    const config = getConfig()
    client = new JellyfinClient(config.jellyfinUrl, config.jellyfinApiKey)
  }
  return client
}

export function resetJellyfinClientForTests(): void {
  client = null
}
