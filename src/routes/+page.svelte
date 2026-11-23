<script lang="ts">
  import { untrack } from 'svelte'
  import type { PageData } from './$types'
  import type { DownloadConfig, LocalDownloadInfo, MovieDetail, MovieSummary } from '#lib/types.js'
  import { page } from '$app/state'
  import { afterNavigate, goto } from '$app/navigation'
  import MovieItem from '#lib/ui/movie-item/index.svelte'
  import MovieDialog from '#lib/ui/movie-dialog.svelte'
  import Icon from '#lib/components/icon.svelte'
  import EmptyState from '#lib/components/empty-state.svelte'
  import { getI18n } from '#core/i18n.svelte.js'
  import { getNotifications } from '#core/notifications.svelte.js'
  import { getDownloadQueue } from '#core/download-queue.svelte.js'
  import { infiniteScroll } from '#lib/actions/infinite-scroll.js'

  let { data }: { data: PageData } = $props()
  const i18n = getI18n()
  const notifications = getNotifications()
  const queue = getDownloadQueue()

  const PAGE_SIZE = 48

  let query = $state(page.url.searchParams.get('q') ?? '')
  let selectedItem = $state<MovieSummary | null>(null)
  let dialogOpen = $state(false)
  let modalError = $state<string | null>(null)
  let initialConfig = $state<DownloadConfig | null>(null)
  let initialConfigForId = $state<string | null>(null)
  let episodeId = $state<string | null>(null)
  let modalParam = $state<string | null>(page.url.searchParams.get('modal'))
  let fromParam = $state<string | null>(page.url.searchParams.get('from'))
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  let extraDownloads = $state<Record<string, number>>({})
  let modalRequest = 0
  let modalLoading: string | null = null
  let appliedKey: string | null = null

  let results = $state<MovieSummary[]>([])
  let total = $state(0)
  let searchOffset = $state(0)
  let searchLoading = $state(false)
  let searchLoadingMore = $state(false)
  let searchError = $state(false)
  let searchVersion = 0
  let searchController: AbortController | null = null

  const hasQuery = $derived(query.trim().length > 0)
  const hasMore = $derived(results.length < total)
  const displayedItems = $derived(
    results.map((item) => {
      const extra = extraDownloads[item.id] ?? 0
      return extra ? { ...item, downloadCount: Math.max(0, item.downloadCount + extra) } : item
    })
  )

  const queueBadges = $derived.by(() => {
    const byMovie = new Map<string, { queued: number; running: number }>()
    const bySeries = new Map<string, { queued: number; running: number }>()
    for (const job of queue.jobs) {
      const target = job.seriesId ? bySeries : byMovie
      const key = job.seriesId ?? job.movieId
      const counts = target.get(key) ?? { queued: 0, running: 0 }
      if (job.state === 'running') counts.running += 1
      else counts.queued += 1
      target.set(key, counts)
    }
    return { byMovie, bySeries }
  })

  function queueBadge(item: MovieSummary): {
    state: 'queued' | 'running' | 'mixed'
    count: number
  } | null {
    const counts =
      item.kind === 'series' ? queueBadges.bySeries.get(item.id) : queueBadges.byMovie.get(item.id)
    if (!counts) return null
    const count = counts.queued + counts.running
    if (count === 0) return null
    if (counts.running > 0 && counts.queued > 0) return { state: 'mixed', count }
    return { state: counts.running > 0 ? 'running' : 'queued', count }
  }

  $effect(() => {
    untrack(() => queue.start())
    return () => queue.stop()
  })

  function summaryFromDetail(detail: MovieDetail): MovieSummary {
    const source = detail.sources[0] ?? null
    return {
      id: detail.id,
      title: detail.title,
      year: detail.year,
      runtimeSeconds: detail.runtimeSeconds,
      imageTag: detail.imageTag,
      media: source
        ? {
            maxHeight:
              source.video.reduce((max, stream) => Math.max(max, stream.height ?? 0), 0) || null,
            container: source.container,
            videoCodec: source.video[0]?.codec ?? null,
            audioLanguages: [...new Set(source.audio.map((track) => track.language ?? 'und'))],
            subtitleCount: source.subtitles.length,
            sizeBytes: source.sizeBytes,
          }
        : null,
      downloadCount: 0,
      kind: detail.kind,
      seriesId: detail.seriesId ?? null,
      seriesName: detail.seriesName ?? null,
      seasonNumber: detail.seasonNumber ?? null,
      episodeNumber: detail.episodeNumber ?? null,
    }
  }

  function locationUrl(): URL {
    return typeof window === 'undefined' ? new URL(page.url.href) : new URL(window.location.href)
  }

  function modalUrl(id: string | null, from: string | null = null): string {
    const url = locationUrl()
    if (id) url.searchParams.set('modal', id)
    else url.searchParams.delete('modal')
    if (from) url.searchParams.set('from', from)
    else url.searchParams.delete('from')
    return `${url.pathname}${url.search}`
  }

  function modalKey(id: string | null, from: string | null): string {
    return `${id ?? ''}\u0000${from ?? ''}`
  }

  function downloadConfig(payload: unknown, id: string): DownloadConfig | null {
    if (!payload || typeof payload !== 'object') return null
    const item = (payload as { item?: LocalDownloadInfo }).item
    if (!item || item.movieId !== id) return null
    return item.config ?? null
  }

  function summaryFromSeries(detail: {
    id: string
    title: string
    year: number | null
    imageTag: string | null
  }): MovieSummary {
    return {
      id: detail.id,
      title: detail.title,
      year: detail.year,
      runtimeSeconds: null,
      imageTag: detail.imageTag,
      media: null,
      downloadCount: 0,
      kind: 'series',
    }
  }

  function showItem(
    item: MovieSummary,
    config: DownloadConfig | null = null,
    episode: string | null = null,
    configFor: string | null = null
  ): void {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    modalError = null
    selectedItem = item
    initialConfig = config
    initialConfigForId = configFor
    episodeId = episode
    dialogOpen = true
  }

  function hideItem(): void {
    dialogOpen = false
    initialConfig = null
    initialConfigForId = null
    episodeId = null
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      if (!dialogOpen) selectedItem = null
      closeTimer = null
    }, 240)
  }

  function openItem(item: MovieSummary): void {
    modalRequest += 1
    modalLoading = null
    showItem(item)
    const url = locationUrl()
    if (url.searchParams.get('modal') === item.id && !url.searchParams.has('from')) return
    void goto(modalUrl(item.id), {
      replace: true,
      shallow: true,
      reset: false,
    })
  }

  function closeItem(): void {
    modalRequest += 1
    modalLoading = null
    initialConfig = null
    hideItem()
    const url = locationUrl()
    if (!url.searchParams.has('modal') && !url.searchParams.has('from')) return
    void goto(modalUrl(null), {
      replace: true,
      shallow: true,
      reset: false,
    })
  }

  function handleEpisodeChange(id: string | null): void {
    const root = selectedItem
    if (!root) return
    episodeId = id
    initialConfig = null
    initialConfigForId = null
    const target = id ?? root.id
    const url = modalUrl(target)
    const current = `${locationUrl().pathname}${locationUrl().search}`
    if (url === current) return
    void goto(url, {
      replace: id === null,
      shallow: true,
      reset: false,
    })
  }

  function reportModalError(message: string): void {
    modalError = message
    notifications.notify({ level: 'error', message })
  }

  async function openResolved(id: string, from: string | null): Promise<void> {
    const requestId = ++modalRequest
    modalLoading = id
    modalError = null
    try {
      const [movieResponse, configResponse] = await Promise.all([
        fetch(`/api/v1/movies/${encodeURIComponent(id)}`),
        from
          ? fetch(`/api/v1/local-downloads/${encodeURIComponent(from)}`).catch(() => null)
          : Promise.resolve(null),
      ])
      const moviePayload: unknown = await movieResponse.json().catch(() => null)
      const configPayload = configResponse?.ok
        ? await configResponse.json().catch(() => null)
        : null
      if (requestId !== modalRequest) return
      if (!movieResponse.ok) {
        reportModalError(i18n.t('page.modalError'))
        return
      }

      const detail = moviePayload as MovieDetail
      let root = summaryFromDetail(detail)
      let selectedEpisode: string | null = null
      if (detail.kind === 'episode' && detail.seriesId) {
        const seriesResponse = await fetch(`/api/v1/series/${encodeURIComponent(detail.seriesId)}`)
        if (requestId !== modalRequest) return
        if (!seriesResponse.ok) {
          reportModalError(i18n.t('page.modalError'))
          return
        }
        const seriesPayload = (await seriesResponse.json()) as {
          id: string
          title: string
          year: number | null
          imageTag: string | null
        }
        root = summaryFromSeries(seriesPayload)
        selectedEpisode = id
      }

      const config = from ? downloadConfig(configPayload, id) : null
      showItem(root, config, selectedEpisode, config ? id : null)
      if (from && !config)
        notifications.notify({ level: 'warn', message: i18n.t('config.unavailable') })
    } catch {
      if (requestId === modalRequest) reportModalError(i18n.t('page.modalError'))
    } finally {
      if (requestId === modalRequest) modalLoading = null
    }
  }

  async function openFromUrl(id: string): Promise<void> {
    const local = displayedItems.find((item) => item.id === id)
    if (local) {
      modalRequest += 1
      modalLoading = null
      showItem(local)
      return
    }
    await openResolved(id, null)
  }

  async function openFromDownload(id: string, from: string): Promise<void> {
    await openResolved(id, from)
  }

  afterNavigate((navigation) => {
    const url = navigation.to?.url ?? locationUrl()
    modalParam = url.searchParams.get('modal')
    fromParam = url.searchParams.get('from')
  })

  $effect(() => {
    const modalId = modalParam
    const from = fromParam
    const key = modalKey(modalId, from)
    if (!modalId) {
      appliedKey = key
      if (from) return
      modalRequest += 1
      modalLoading = null
      episodeId = null
      initialConfigForId = null
      if (untrack(() => dialogOpen)) hideItem()
      return
    }

    const item = untrack(() => selectedItem)
    const episode = untrack(() => episodeId)
    if (!from && item) {
      if (modalId === item.id) {
        appliedKey = key
        if (item.kind === 'series' && episode !== null) episodeId = null
        return
      }
      if (item.kind === 'series' && modalId === episode) {
        appliedKey = key
        return
      }
    }

    if (key === appliedKey) return
    appliedKey = key
    if (from) void openFromDownload(modalId, from)
    else void openFromUrl(modalId)
  })

  $effect(() => {
    const value = query.trim()
    const current = (locationUrl().searchParams.get('q') ?? '').trim()
    if (value === current) return
    const timer = setTimeout(() => {
      const url = locationUrl()
      if (value) url.searchParams.set('q', value)
      else url.searchParams.delete('q')
      void goto(`${url.pathname}${url.search}`, {
        replace: true,
        shallow: true,
        reset: false,
      })
    }, 150)
    return () => clearTimeout(timer)
  })

  function mergeItems(current: MovieSummary[], page: MovieSummary[]): MovieSummary[] {
    const seen = new Set(current.map((item) => item.id))
    return [...current, ...page.filter((item) => !seen.has(item.id))]
  }

  async function searchPage(offset: number, append: boolean): Promise<void> {
    const value = query.trim()
    if (!value) return
    const version = ++searchVersion
    searchController?.abort()
    const controller = new AbortController()
    searchController = controller
    if (append) searchLoadingMore = true
    else searchLoading = true
    searchError = false
    try {
      const params = new URLSearchParams({
        q: value,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      const response = await fetch(`/api/v1/movies?${params}`, { signal: controller.signal })
      if (!response.ok) throw new Error('search failed')
      const payload = (await response.json()) as { items: MovieSummary[]; total: number }
      if (version !== searchVersion) return
      const items = payload.items ?? []
      results = append ? mergeItems(results, items) : items
      total = payload.total ?? results.length
      searchOffset = offset + items.length
    } catch (error) {
      if (controller.signal.aborted) return
      if (version === searchVersion) searchError = true
    } finally {
      if (version === searchVersion) {
        searchLoading = false
        searchLoadingMore = false
      }
    }
  }

  function loadMore(): void {
    if (searchLoading || searchLoadingMore || !hasMore) return
    void searchPage(searchOffset, true)
  }

  function retrySearch(): void {
    results = []
    total = 0
    searchOffset = 0
    void searchPage(0, false)
  }

  $effect(() => {
    const value = query.trim()
    ++searchVersion
    searchController?.abort()
    searchController = null
    results = []
    total = 0
    searchOffset = 0
    searchError = false
    if (!value) {
      searchLoading = false
      searchLoadingMore = false
      return
    }
    const timer = setTimeout(() => void searchPage(0, false), 200)
    return () => clearTimeout(timer)
  })
</script>

<div class="hero">
  <div>
    <h1>{i18n.t('movies.title')}</h1>
    <p>{i18n.t('movies.subtitle')}</p>
  </div>
</div>

{#if data.settingsWarning}
  <div class="note warn" role="status">{i18n.t('page.settingsWarning')}</div>
{/if}
{#if modalError}
  <div class="error-box" role="alert">{modalError}</div>
{/if}

<section class="search-page" aria-label={i18n.t('movies.searchAria')}>
  <div class="search">
    <span class="search-icon" aria-hidden="true"><Icon name="search" size={20} /></span>
    <input
      bind:value={query}
      type="search"
      placeholder={i18n.t('movies.searchPlaceholder')}
      aria-label={i18n.t('movies.searchAria')}
    />
  </div>

  {#if hasQuery}
    <div class="search-meta">
      <span class="muted small" aria-live="polite">
        {i18n.t('movies.count', { count: total })}
      </span>
    </div>
  {/if}

  {#if !hasQuery}
    <EmptyState
      icon="search"
      title={i18n.t('movies.startSearchTitle')}
      description={i18n.t('movies.startSearchHint')}
      variant="empty"
    />
  {:else if searchLoading && displayedItems.length === 0}
    <div class="note" role="status">{i18n.t('common.loading')}</div>
  {:else if searchError && displayedItems.length === 0}
    <div class="error-box" role="alert">
      {i18n.t('movies.searchError')}
      <button type="button" class="ghost hover-shine" onclick={retrySearch}>
        {i18n.t('common.retry')}
      </button>
    </div>
  {:else if displayedItems.length === 0}
    <EmptyState
      icon="search"
      title={i18n.t('movies.emptyTitle')}
      description={i18n.t('movies.emptyHint')}
      variant="no-results"
    />
  {:else}
    {#if searchError}
      <div class="note warn" role="alert">{i18n.t('movies.searchError')}</div>
    {/if}
    <div class="movie-grid" aria-busy={searchLoading || searchLoadingMore}>
      {#each displayedItems as item (item.id)}
        <MovieItem
          movie={item}
          selected={selectedItem?.id === item.id}
          queue={queueBadge(item)}
          onselect={openItem}
        />
      {/each}
    </div>
    {#if hasMore}
      <div
        class="load-more"
        use:infiniteScroll={{
          enabled: hasMore && !searchLoading && !searchLoadingMore,
          load: loadMore,
        }}
      >
        <button
          type="button"
          class="ghost hover-shine"
          disabled={searchLoadingMore}
          onclick={loadMore}
        >
          {searchLoadingMore ? i18n.t('common.loadingMore') : i18n.t('common.loadMore')}
        </button>
      </div>
    {/if}
  {/if}
</section>

{#if selectedItem}
  <MovieDialog
    movie={selectedItem}
    settings={data.settings}
    capabilities={data.capabilities}
    open={dialogOpen}
    {initialConfig}
    {initialConfigForId}
    {episodeId}
    onepisodechange={handleEpisodeChange}
    onclose={closeItem}
    onstored={(itemId) => {
      extraDownloads = { ...extraDownloads, [itemId]: (extraDownloads[itemId] ?? 0) + 1 }
    }}
    ondeleted={(itemId) => {
      extraDownloads = { ...extraDownloads, [itemId]: (extraDownloads[itemId] ?? 0) - 1 }
    }}
  />
{/if}

<style>
  .load-more {
    display: flex;
    justify-content: center;
    margin-top: 1.25rem;
  }
</style>
