<script lang="ts">
  import type { PageData } from './$types'
  import type { DownloadConfig, LocalDownloadInfo, MovieDetail, MovieSummary } from '#lib/types.js'
  import { normalizeSearch } from '#lib/format.js'
  import { page } from '$app/state'
  import { afterNavigate, goto } from '$app/navigation'
  import MovieItem from '#lib/ui/movie-item/index.svelte'
  import MovieDialog from '#lib/ui/movie-dialog.svelte'
  import Icon from '#lib/components/icon.svelte'
  import EmptyState from '#lib/components/empty-state.svelte'
  import { getI18n } from '#core/i18n.svelte.js'
  import { getNotifications } from '#core/notifications.svelte.js'

  let { data }: { data: PageData } = $props()
  const i18n = getI18n()
  const notifications = getNotifications()

  let query = $state(page.url.searchParams.get('q') ?? '')
  let selectedItem = $state<MovieSummary | null>(null)
  let dialogOpen = $state(false)
  let modalError = $state<string | null>(null)
  let initialConfig = $state<DownloadConfig | null>(null)
  let modalParam = $state<string | null>(page.url.searchParams.get('modal'))
  let fromParam = $state<string | null>(page.url.searchParams.get('from'))
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  let extraDownloads = $state<Record<string, number>>({})
  let modalRequest = 0
  let modalLoading: string | null = null
  let appliedKey: string | null = null

  const items = $derived(
    data.items.map((item) => {
      const extra = extraDownloads[item.id] ?? 0
      return extra ? { ...item, downloadCount: Math.max(0, item.downloadCount + extra) } : item
    })
  )

  const hasQuery = $derived(normalizeSearch(query).length > 0)
  const filteredItems = $derived.by(() => {
    if (!hasQuery) return []
    const normalized = normalizeSearch(query)
    return items.filter((item) =>
      normalizeSearch(`${item.title} ${item.year ?? ''} ${item.seriesName ?? ''}`).includes(
        normalized
      )
    )
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

  function showItem(item: MovieSummary, config: DownloadConfig | null = null): void {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    modalError = null
    selectedItem = item
    initialConfig = config
    dialogOpen = true
  }

  function hideItem(): void {
    dialogOpen = false
    initialConfig = null
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

  function reportModalError(message: string): void {
    modalError = message
    notifications.notify({ level: 'error', message })
  }

  async function openFromUrl(id: string): Promise<void> {
    const requestId = ++modalRequest
    modalLoading = id
    modalError = null
    const local = items.find((item) => item.id === id)
    if (local) {
      modalLoading = null
      showItem(local)
      return
    }
    try {
      const response = await fetch(`/api/v1/movies/${encodeURIComponent(id)}`)
      const payload: unknown = await response.json()
      if (requestId !== modalRequest) return
      if (!response.ok) {
        reportModalError(i18n.t('page.modalError'))
        return
      }
      showItem(summaryFromDetail(payload as MovieDetail))
    } catch {
      if (requestId === modalRequest) reportModalError(i18n.t('page.modalError'))
    } finally {
      if (requestId === modalRequest) modalLoading = null
    }
  }

  async function openFromDownload(id: string, from: string): Promise<void> {
    const requestId = ++modalRequest
    modalLoading = id
    modalError = null
    try {
      const [movieResponse, configResponse] = await Promise.all([
        fetch(`/api/v1/movies/${encodeURIComponent(id)}`),
        fetch(`/api/v1/local-downloads/${encodeURIComponent(from)}`).catch(() => null),
      ])
      const moviePayload: unknown = await movieResponse.json().catch(() => null)
      const configPayload: unknown = configResponse?.ok
        ? await configResponse.json().catch(() => null)
        : null
      if (requestId !== modalRequest) return
      if (!movieResponse.ok) {
        reportModalError(i18n.t('page.modalError'))
        return
      }
      const config = downloadConfig(configPayload, id)
      showItem(summaryFromDetail(moviePayload as MovieDetail), config)
      if (!config) notifications.notify({ level: 'warn', message: i18n.t('config.unavailable') })
    } catch {
      if (requestId === modalRequest) reportModalError(i18n.t('page.modalError'))
    } finally {
      if (requestId === modalRequest) modalLoading = null
    }
  }

  afterNavigate(() => {
    const url = locationUrl()
    modalParam = url.searchParams.get('modal')
    fromParam = url.searchParams.get('from')
  })

  $effect(() => {
    const modalId = modalParam
    const from = fromParam
    const key = modalKey(modalId, from)
    if (key === appliedKey) return
    appliedKey = key
    if (!modalId) {
      if (from) return
      modalRequest += 1
      modalLoading = null
      if (dialogOpen) hideItem()
      return
    }
    if (!from) {
      if (selectedItem?.id === modalId) {
        modalRequest += 1
        modalLoading = null
        showItem(selectedItem)
        return
      }
      if (modalLoading === modalId) return
      void openFromUrl(modalId)
      return
    }
    void openFromDownload(modalId, from)
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
</script>

<div class="hero">
  <div>
    <h1>{i18n.t('movies.title')}</h1>
    <p>{i18n.t('movies.subtitle')}</p>
  </div>
</div>

{#if data.loadError}
  <div class="error-box" role="alert">{i18n.t('page.loadError')}</div>
{/if}
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
        {i18n.t('movies.count', { count: filteredItems.length })}
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
  {:else if filteredItems.length === 0}
    <EmptyState
      icon="search"
      title={i18n.t('movies.emptyTitle')}
      description={i18n.t('movies.emptyHint')}
      variant="no-results"
    />
  {:else}
    <div class="movie-grid">
      {#each filteredItems as item (item.id)}
        <MovieItem movie={item} selected={selectedItem?.id === item.id} onselect={openItem} />
      {/each}
    </div>
  {/if}
</section>

{#if selectedItem}
  <MovieDialog
    movie={selectedItem}
    settings={data.settings}
    capabilities={data.capabilities}
    open={dialogOpen}
    {initialConfig}
    onclose={closeItem}
    onstored={(itemId) => {
      extraDownloads = { ...extraDownloads, [itemId]: (extraDownloads[itemId] ?? 0) + 1 }
    }}
    ondeleted={(itemId) => {
      extraDownloads = { ...extraDownloads, [itemId]: (extraDownloads[itemId] ?? 0) - 1 }
    }}
  />
{/if}
