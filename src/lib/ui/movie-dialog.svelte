<script lang="ts">
  import { untrack } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import type {
    BatchDownloadResult,
    Capabilities,
    DownloadConfig,
    DownloadJobStatus,
    DownloadOptionsInput,
    LocalDownloadInfo,
    LocalDownloadsCheckResult,
    MediaSourceInfo,
    MovieDetail,
    MovieSummary,
    SeriesDetail,
    SettingsDocument,
    SubtitlePackaging,
    TabItem,
    TrackSelection,
  } from '#lib/types.js'
  import {
    formatBytes,
    formatDuration,
    formatLanguage,
    formatProcessingTime,
    formatTimestamp,
  } from '#lib/format.js'
  import ModalShell from '#lib/components/modal-shell.svelte'
  import Icon from '#lib/components/icon.svelte'
  import Tabs from '#lib/components/tabs.svelte'
  import ConfirmDialog from '#lib/components/confirm-dialog.svelte'
  import CollapsibleSection from '#lib/components/collapsible-section.svelte'
  import JobPanel from '#lib/ui/job-panel.svelte'
  import OutputSettings from '#lib/ui/output-settings.svelte'
  import BatchPanel from '#lib/ui/batch-panel.svelte'
  import DownloadQueue from '#lib/ui/download-queue.svelte'
  import DownloadConfigBadge from '#lib/ui/download-config-badge.svelte'
  import { getI18n } from '#core/i18n.svelte.js'
  import { getNotifications } from '#core/notifications.svelte.js'
  import { getDownloadQueue } from '#core/download-queue.svelte.js'

  let {
    movie,
    settings,
    capabilities,
    open,
    onclose,
    onstored,
    ondeleted,
    initialConfig = null,
    initialConfigForId = null,
    episodeId = null,
    onepisodechange,
    onopenitem,
  }: {
    movie: MovieSummary
    settings: SettingsDocument
    capabilities: Capabilities
    open: boolean
    onclose: () => void
    onstored?: (movieId: string) => void
    ondeleted?: (itemId: string) => void
    initialConfig?: DownloadConfig | null
    initialConfigForId?: string | null
    episodeId?: string | null
    onepisodechange?: (id: string | null) => void
    onopenitem?: (id: string) => void
  } = $props()

  const i18n = getI18n()
  const notifications = getNotifications()
  const queue = getDownloadQueue()
  let detail = $state<MovieDetail | null>(null)
  let detailLoading = $state(true)
  let detailError = $state<string | null>(null)
  let detailRequest = 0
  let sourceId = $state('')
  let options = $state<DownloadOptionsInput>(initialOptions())
  let selectedAudio = $state<number[]>([])
  let selectedSubtitles = $state<number[]>([])
  let subtitleOverrides = $state<Record<number, SubtitlePackaging>>({})
  let presetId = $state('')
  let cache = $state<LocalDownloadsCheckResult | null>(null)
  let cacheLoading = $state(false)
  let job = $state<DownloadJobStatus | null>(null)
  let jobError = $state<string | null>(null)
  let submitting = $state(false)
  let storedNotified = $state(false)
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  let activeTab = $state('details')
  let series = $state<SeriesDetail | null>(null)
  let seriesLoading = $state(false)
  let seriesError = $state<string | null>(null)
  let seriesRequest = 0
  let selectedEpisode = $state<MovieSummary | null>(null)

  let downloads = $state<LocalDownloadInfo[]>([])
  let downloadsEnabled = $state(true)
  let downloadsLoading = $state(false)
  let downloadsError = $state<string | null>(null)
  let downloadsTotal = $state(0)
  let downloadsLoaded = $state(false)
  let downloadsScope = ''
  let downloadsRequest = 0
  let previousQueueActive = 0
  let deleting = $state(false)
  let pendingDelete = $state<LocalDownloadInfo | null>(null)
  let pendingJobCancel = $state<DownloadJobStatus | null>(null)
  let pendingBatchCancel = $state<{
    movieId: string
    title: string
    job: DownloadJobStatus
  } | null>(null)
  let cancellingJob = $state(false)
  let sectionOpen = $state({ output: true, audio: true, subtitles: true })
  let openSeasons = $state<Record<number, boolean>>({})
  let seriesSizeBytes = $state<number | null>(null)
  let seriesSizeLoading = $state(false)

  // Local fallback for items whose summary is not re-fetched after a store/delete.
  let countAdjustments = $state<Record<string, number>>({})
  let initialConfigApplied = false
  const notifiedJobStates = new SvelteSet<string>()

  let batchMode = $state(false)
  let batchConfigure = $state(false)
  let batchSelected = $state<string[]>([])
  let batchOptions = $state<DownloadOptionsInput>(initialBatchOptions())
  let batchPresetId = $state('')
  let batchJobs = $state<{ movieId: string; title: string; job: DownloadJobStatus }[]>([])
  let batchError = $state<string | null>(null)
  let batchSubmitting = $state(false)
  let batchPollTimer: ReturnType<typeof setTimeout> | null = null
  let batchPollGeneration = 0
  const batchNotified = new SvelteSet<string>()
  const terminalStates = new Set<DownloadJobStatus['state']>(['ready', 'failed', 'cancelled'])

  function initialOptions(): DownloadOptionsInput {
    const defaults = settings.defaults
    return {
      container: defaults.container,
      quality: defaults.quality,
      videoCodec: defaults.videoCodec,
      audioCodec: defaults.audioCodec,
      audioSelection: 'all',
      audioPackaging: defaults.audioPackaging,
      subtitleSelection: 'all',
      subtitleStrategy: defaults.subtitleStrategy,
    }
  }

  function initialBatchOptions(): DownloadOptionsInput {
    return initialOptions()
  }

  const isSeries = $derived(movie.kind === 'series')
  const activeItem = $derived<MovieSummary>(selectedEpisode ?? movie)
  const seriesListMode = $derived(isSeries && !selectedEpisode)
  const downloadsCount = $derived.by(() => {
    if (downloadsLoaded) return downloadsTotal
    if (seriesListMode) {
      return (series?.episodes ?? []).reduce((total, episode) => total + episode.downloadCount, 0)
    }
    return activeItem.downloadCount + (countAdjustments[activeItem.id] ?? 0)
  })
  const queueJobs = $derived.by(() => {
    if (isSeries) {
      const episode = selectedEpisode
      if (episode) return queue.jobs.filter((job) => job.movieId === episode.id)
      return queue.jobs.filter((job) => job.seriesId === movie.id)
    }
    return queue.jobs.filter((job) => job.movieId === movie.id)
  })
  const dialogTitle = $derived.by(() => {
    const base = selectedEpisode ? `${movie.title} · ${episodeCode(selectedEpisode)}` : movie.title
    const year = detail?.year ?? activeItem.year ?? movie.year
    return year ? `${base} (${year})` : base
  })
  const tabItems = $derived<TabItem[]>([
    { id: 'details', label: i18n.t('detail.tab.details') },
    { id: 'downloads', label: i18n.t('detail.tab.downloadsCount', { count: downloadsCount }) },
    { id: 'queue', label: i18n.t('detail.tab.queueCount', { count: queueJobs.length }) },
  ])
  const posterId = $derived(
    seriesListMode ? movie.id : activeItem.imageTag ? activeItem.id : movie.id
  )
  const posterTag = $derived(
    seriesListMode
      ? (series?.imageTag ?? movie.imageTag)
      : (detail?.imageTag ?? activeItem.imageTag)
  )

  const selectedPresetName = $derived(
    settings.presets.find((preset) => preset.id === presetId)?.name ?? i18n.t('config.badgeCustom')
  )
  const filenamePreview = $derived.by(() => {
    const itemTitle = detail?.title ?? activeItem.title
    const title =
      activeItem.kind === 'episode'
        ? `${activeItem.seriesName ?? movie.title} ${episodeCode(activeItem)} - ${itemTitle}`
        : itemTitle
    const year = detail?.year ?? activeItem.year
    const base = year ? `${title} (${year})` : title
    return `${base} - ${selectedPresetName}`
  })

  const seasons = $derived.by(() => {
    const groups: { season: number; episodes: MovieSummary[] }[] = []
    for (const episode of series?.episodes ?? []) {
      const season = episode.seasonNumber ?? 0
      const group = groups.find((candidate) => candidate.season === season)
      if (group) group.episodes.push(episode)
      else groups.push({ season, episodes: [episode] })
    }
    return groups
      .sort((a, b) => a.season - b.season)
      .map((group) => ({
        season: group.season,
        label:
          group.season === 0
            ? i18n.t('detail.series.special')
            : i18n.t('detail.series.season', { season: group.season }),
        episodes: [...group.episodes].sort(
          (a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)
        ),
      }))
  })

  const source = $derived<MediaSourceInfo | null>(
    detail?.sources.find((candidate) => candidate.id === sourceId) ?? detail?.sources[0] ?? null
  )

  const resolution = $derived(
    source?.video.reduce((max, stream) => Math.max(max, stream.height ?? 0), 0) ||
      activeItem.media?.maxHeight ||
      null
  )
  const audioLanguages = $derived(
    source
      ? [...new Set(source.audio.map((track) => track.language ?? 'und'))]
      : (activeItem.media?.audioLanguages ?? [])
  )
  const subtitleCount = $derived(source?.subtitles.length ?? activeItem.media?.subtitleCount ?? 0)
  const allAudioSelected = $derived.by(() => {
    if (!source || source.audio.length === 0) return false
    return selectedAudio.length === source.audio.length
  })
  const allSubtitlesSelected = $derived.by(() => {
    if (!source || source.subtitles.length === 0) return false
    return selectedSubtitles.length === source.subtitles.length
  })

  $effect(() => {
    untrack(() => queue.start())
    return () => queue.stop()
  })

  function episodeCode(item: MovieSummary): string {
    const season = item.seasonNumber ?? 0
    const episode = item.episodeNumber ?? 0
    return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
  }

  function effectiveSubtitlePackaging(subtitle: {
    index: number
    isExternal: boolean
  }): SubtitlePackaging {
    const override = subtitleOverrides[subtitle.index]
    if (override) return override
    switch (options.subtitleStrategy) {
      case 'mirror-source':
        return subtitle.isExternal ? 'separate' : 'mux'
      case 'muxed':
        return 'mux'
      case 'separate':
        return 'separate'
      case 'burn':
        return 'burn'
      default:
        return 'separate'
    }
  }

  const separateAudioCount = $derived(
    options.audioPackaging === 'separate' ? selectedAudio.length : 0
  )
  const separateSubtitleCount = $derived(
    (source?.subtitles ?? [])
      .filter((subtitle) => selectedSubtitles.includes(subtitle.index))
      .filter((subtitle) => effectiveSubtitlePackaging(subtitle) === 'separate').length
  )
  const expectedFiles = $derived(1 + separateAudioCount + separateSubtitleCount)
  const outputKind = $derived(expectedFiles > 1 ? 'zip' : 'file')
  const canDownload = $derived(
    Boolean(detail && source && capabilities.ffmpeg.available && !submitting)
  )

  function resolveSelection(
    streams: { index: number; language: string | null; isDefault: boolean; isForced: boolean }[],
    selection: TrackSelection,
    kind: 'audio' | 'subtitle'
  ): number[] {
    if (selection === 'all') return streams.map((stream) => stream.index)
    if (selection === 'none') return []
    if (selection === 'default') {
      const preferred = streams.filter((stream) =>
        kind === 'audio' ? stream.isDefault : stream.isDefault || stream.isForced
      )
      return (preferred.length ? preferred : streams.slice(0, 1)).map((stream) => stream.index)
    }
    return streams
      .filter((stream) => {
        const language = stream.language?.toLowerCase() ?? 'und'
        return selection.languages.some((candidate) => candidate.toLowerCase() === language)
      })
      .map((stream) => stream.index)
  }

  function applyPreset(id: string): void {
    presetId = id
    if (!id) return
    const preset = settings.presets.find((candidate) => candidate.id === id)
    if (!preset) return
    const next: DownloadOptionsInput = { ...options, ...preset.options }
    if (next.quality !== 'original' && next.videoCodec === 'copy') next.videoCodec = 'h264'
    if (next.subtitleStrategy === 'burn' && next.videoCodec === 'copy') next.videoCodec = 'h264'
    options = next
    subtitleOverrides = {}
    if (preset.options.audioSelection) {
      selectedAudio = resolveSelection(source?.audio ?? [], preset.options.audioSelection, 'audio')
    }
    if (preset.options.subtitleSelection) {
      selectedSubtitles = resolveSelection(
        source?.subtitles ?? [],
        preset.options.subtitleSelection,
        'subtitle'
      )
    }
    normalizeOutput(false)
  }

  function resetForSource(
    nextDetail: MovieDetail,
    nextSource: MediaSourceInfo | null,
    config: DownloadConfig | null = null
  ): void {
    const defaults = settings.defaults
    options = {
      container: defaults.container,
      quality: defaults.quality,
      videoCodec: defaults.videoCodec,
      audioCodec: defaults.audioCodec,
      audioSelection: 'all',
      audioPackaging: defaults.audioPackaging,
      subtitleSelection: 'all',
      subtitleStrategy: defaults.subtitleStrategy,
    }
    if (options.quality !== 'original' && options.videoCodec === 'copy') options.videoCodec = 'h264'
    selectedAudio = nextSource?.audio.map((track) => track.index) ?? []
    selectedSubtitles = nextSource?.subtitles.map((subtitle) => subtitle.index) ?? []
    subtitleOverrides = {}
    presetId = ''
    job = null
    jobError = null
    cache = null
    detailError = null
    storedNotified = false
    detail = nextDetail
    notifiedJobStates.clear()
    if (config) applyInitialConfig(config, nextSource)
  }

  function applyInitialConfig(config: DownloadConfig, nextSource: MediaSourceInfo | null): void {
    const merged: DownloadOptionsInput = { ...options, ...config.options }
    if (merged.quality !== 'original' && merged.videoCodec === 'copy') merged.videoCodec = 'h264'
    if (merged.subtitleStrategy === 'burn' && merged.videoCodec === 'copy')
      merged.videoCodec = 'h264'
    options = merged
    presetId = config.presetId ?? ''

    const audioIndices = config.options.audioStreamIndices
    selectedAudio = audioIndices
      ? audioIndices.filter((index) => nextSource?.audio.some((track) => track.index === index))
      : (nextSource?.audio.map((track) => track.index) ?? [])

    const subtitleIndices = config.options.subtitleStreamIndices
    selectedSubtitles = subtitleIndices
      ? subtitleIndices.filter((index) =>
          nextSource?.subtitles.some((subtitle) => subtitle.index === index)
        )
      : (nextSource?.subtitles.map((subtitle) => subtitle.index) ?? [])

    const overrides: Record<number, SubtitlePackaging> = {}
    if (config.options.subtitlePackaging) {
      for (const [key, value] of Object.entries(config.options.subtitlePackaging)) {
        const index = Number(key)
        if (selectedSubtitles.includes(index)) overrides[index] = value
      }
    }
    subtitleOverrides = overrides
  }

  function errorMessage(payload: unknown, fallback: string): string {
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const error = (payload as { error?: { code?: unknown; message?: unknown } }).error
      if (error && typeof error.code === 'string') {
        return i18n.error(error.code, typeof error.message === 'string' ? error.message : fallback)
      }
      if (error && typeof error.message === 'string') return error.message
    }
    return fallback
  }

  async function loadDetail(id: string): Promise<void> {
    const requestId = ++detailRequest
    detail = null
    detailLoading = true
    detailError = null
    stopPolling()
    try {
      const response = await fetch(`/api/v1/movies/${id}`)
      const payload: unknown = await response.json()
      if (requestId !== detailRequest) return
      if (!response.ok) {
        detailError = errorMessage(payload, i18n.t('detail.error'))
        return
      }
      const nextDetail = payload as MovieDetail
      const configTarget = initialConfigForId ?? movie.id
      const config =
        !initialConfigApplied && initialConfig && nextDetail.id === configTarget
          ? initialConfig
          : null
      const requestedSource = config?.mediaSourceId
        ? nextDetail.sources.find((candidate) => candidate.id === config.mediaSourceId)
        : null
      const nextSource = requestedSource ?? nextDetail.sources[0] ?? null
      sourceId = nextSource?.id ?? ''
      resetForSource(nextDetail, nextSource, config)
      if (config) initialConfigApplied = true
    } catch {
      if (requestId === detailRequest) detailError = i18n.t('errors.JELLYFIN_ERROR')
    } finally {
      if (requestId === detailRequest) detailLoading = false
    }
  }

  async function loadSeries(id: string): Promise<void> {
    const requestId = ++seriesRequest
    series = null
    seriesLoading = true
    seriesError = null
    detail = null
    job = null
    jobError = null
    cache = null
    stopPolling()
    notifiedJobStates.clear()
    try {
      const response = await fetch(`/api/v1/series/${id}`)
      const payload: unknown = await response.json()
      if (requestId !== seriesRequest) return
      if (!response.ok) {
        seriesError = errorMessage(payload, i18n.t('detail.series.error'))
        return
      }
      series = payload as SeriesDetail
    } catch {
      if (requestId === seriesRequest) seriesError = i18n.t('errors.JELLYFIN_ERROR')
    } finally {
      if (requestId === seriesRequest) seriesLoading = false
    }
  }

  async function loadDownloads(): Promise<void> {
    const requestId = ++downloadsRequest
    const seriesMode = seriesListMode
    const scope = seriesMode ? `series:${movie.id}` : `item:${activeItem.id}`
    if (scope !== downloadsScope) {
      downloadsScope = scope
      downloadsLoaded = false
    }
    const query = seriesMode
      ? `seriesId=${encodeURIComponent(movie.id)}`
      : `movieId=${encodeURIComponent(activeItem.id)}`
    downloadsLoading = true
    downloadsError = null
    try {
      const response = await fetch(`/api/v1/local-downloads?${query}`)
      const payload: unknown = await response.json()
      if (requestId !== downloadsRequest) return
      if (!response.ok) {
        downloadsError = errorMessage(payload, i18n.t('detail.downloads.error'))
        return
      }
      const body = payload as {
        enabled: boolean
        items: LocalDownloadInfo[]
        total: number
      }
      downloadsEnabled = body.enabled
      downloads = body.items
      downloadsTotal = body.total ?? body.items.length
      downloadsLoaded = true
    } catch {
      if (requestId === downloadsRequest) downloadsError = i18n.t('detail.downloads.error')
    } finally {
      if (requestId === downloadsRequest) downloadsLoading = false
    }
  }

  function selectEpisode(episode: MovieSummary): void {
    selectedEpisode = episode
    activeTab = 'details'
    onepisodechange?.(episode.id)
  }

  $effect(() => {
    if (!open || !isSeries) return
    const seriesId = movie.id
    const controller = new AbortController()
    seriesSizeBytes = null
    seriesSizeLoading = true
    fetch(`/api/v1/series/${encodeURIComponent(seriesId)}/size`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null
        const payload = (await response.json()) as { totalSizeBytes?: number | null }
        return payload.totalSizeBytes ?? null
      })
      .then((size) => {
        if (!controller.signal.aborted) seriesSizeBytes = size
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) seriesSizeLoading = false
      })
    return () => controller.abort()
  })

  $effect(() => {
    if (!open || !isSeries) return
    if (episodeId) {
      const target = series?.episodes.find((episode) => episode.id === episodeId)
      if (target && selectedEpisode?.id !== target.id) {
        selectedEpisode = target
        activeTab = 'details'
      }
      return
    }
    if (selectedEpisode) selectedEpisode = null
  })

  $effect(() => {
    const season = selectedEpisode?.seasonNumber ?? null
    if (season === null || openSeasons[season]) return
    openSeasons = { ...openSeasons, [season]: true }
  })

  function seasonOpen(season: number): boolean {
    return openSeasons[season] === true
  }

  function toggleSeason(season: number): void {
    openSeasons = { ...openSeasons, [season]: !openSeasons[season] }
  }

  function backToSeries(): void {
    selectedEpisode = null
    activeTab = 'details'
    onepisodechange?.(null)
  }

  function openQueuedItem(job: DownloadJobStatus): void {
    if (isSeries) {
      const episode = series?.episodes.find((candidate) => candidate.id === job.movieId)
      if (episode) {
        selectEpisode(episode)
        return
      }
    }
    if (job.movieId === movie.id) {
      activeTab = 'details'
      return
    }
    onopenitem?.(job.movieId)
  }

  function adjustEpisodeCount(itemId: string, delta: number): void {
    // `series` is deeply reactive, so updating the episode in place keeps the
    // list and the selected episode (same proxy) in sync without reloading.
    const episode = series?.episodes.find((candidate) => candidate.id === itemId)
    if (episode) {
      episode.downloadCount = Math.max(0, episode.downloadCount + delta)
      return
    }
    if (selectedEpisode?.id === itemId) {
      selectedEpisode.downloadCount = Math.max(0, selectedEpisode.downloadCount + delta)
      return
    }
    countAdjustments = {
      ...countAdjustments,
      [itemId]: (countAdjustments[itemId] ?? 0) + delta,
    }
  }

  async function confirmDelete(): Promise<void> {
    const item = pendingDelete
    if (!item || deleting) return
    deleting = true
    downloadsError = null
    try {
      const response = await fetch(`/api/v1/local-downloads/${encodeURIComponent(item.key)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) {
        downloadsError = i18n.t('detail.downloads.error')
        notifications.notify({ level: 'error', message: downloadsError })
        return
      }
      downloads = downloads.filter((candidate) => candidate.key !== item.key)
      if (item.movieId) {
        ondeleted?.(item.movieId)
        adjustEpisodeCount(item.movieId, -1)
        if (isSeries && movie.id !== item.movieId) ondeleted?.(movie.id)
      }
      const notice = i18n.t('detail.downloads.deleted')
      notifications.notify({ level: 'success', message: notice })
      pendingDelete = null
      await loadDownloads()
    } catch {
      downloadsError = i18n.t('detail.downloads.error')
      notifications.notify({ level: 'error', message: downloadsError })
    } finally {
      deleting = false
      pendingDelete = null
    }
  }

  $effect(() => {
    void open
    void movie.id
    activeTab = 'details'
    selectedEpisode = null
    openSeasons = {}
    seriesSizeBytes = null
    initialConfigApplied = false
    resetBatch()
  })

  $effect(() => {
    if (!open) return
    return () => {
      stopPolling()
      stopBatchPolling()
    }
  })

  $effect(() => {
    if (!open) return
    if (isSeries && !selectedEpisode) {
      void loadSeries(movie.id)
      return () => {
        seriesRequest += 1
      }
    }
    void loadDetail(activeItem.id)
    return () => {
      detailRequest += 1
      stopPolling()
    }
  })

  $effect(() => {
    if (!open) return
    const query = seriesListMode
      ? `seriesId=${encodeURIComponent(movie.id)}`
      : `movieId=${encodeURIComponent(activeItem.id)}`
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async (): Promise<void> => {
      if (cancelled) return
      try {
        const response = await fetch(`/api/v1/local-downloads/count?${query}`)
        if (response.ok) {
          const body = (await response.json()) as { total: number }
          if (!cancelled && body.total !== downloadsTotal) {
            downloadsTotal = body.total
            downloadsLoaded = true
            if (activeTab === 'downloads') void loadDownloads()
          }
        }
      } catch {
        // keep the last known count
      }
      if (!cancelled) timer = setTimeout(() => void tick(), 5000)
    }
    timer = setTimeout(() => void tick(), 5000)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  })

  $effect(() => {
    const active = queue.jobs.length
    if (active < previousQueueActive) void loadDownloads()
    previousQueueActive = active
  })

  $effect(() => {
    if (!open) return
    void loadDownloads()
  })

  $effect(() => {
    if (activeTab !== 'downloads') return
    untrack(() => void loadDownloads())
  })

  function changeSource(nextId: string): void {
    sourceId = nextId
    const nextSource = detail?.sources.find((candidate) => candidate.id === nextId) ?? null
    if (!detail) return
    selectedAudio = nextSource?.audio.map((track) => track.index) ?? []
    selectedSubtitles = nextSource?.subtitles.map((subtitle) => subtitle.index) ?? []
    subtitleOverrides = {}
    job = null
    jobError = null
    cache = null
  }

  function toggleAudio(index: number, checked: boolean): void {
    presetId = ''
    selectedAudio = checked
      ? [...new Set([...selectedAudio, index])].sort((a, b) => a - b)
      : selectedAudio.filter((value) => value !== index)
  }

  function toggleSubtitle(index: number, checked: boolean): void {
    presetId = ''
    if (options.subtitleStrategy === 'burn') {
      selectedSubtitles = checked ? [index] : []
      return
    }
    selectedSubtitles = checked
      ? [...new Set([...selectedSubtitles, index])].sort((a, b) => a - b)
      : selectedSubtitles.filter((value) => value !== index)
  }

  function selectAllAudio(): void {
    presetId = ''
    selectedAudio = (source?.audio ?? []).map((track) => track.index)
  }

  function clearAudioSelection(): void {
    presetId = ''
    selectedAudio = []
  }

  function selectAllSubtitles(): void {
    if (!source || options.subtitleStrategy === 'burn') return
    presetId = ''
    selectedSubtitles = source.subtitles.map((subtitle) => subtitle.index)
  }

  function clearSubtitleSelection(): void {
    presetId = ''
    selectedSubtitles = []
  }

  function setSubtitleOverride(index: number, value: string): void {
    presetId = ''
    if (value === 'auto') {
      const next = { ...subtitleOverrides }
      delete next[index]
      subtitleOverrides = next
      return
    }
    if (value === 'mux' || value === 'separate') {
      subtitleOverrides = { ...subtitleOverrides, [index]: value }
    }
  }

  function outputChanged(): void {
    normalizeOutput(true)
  }

  function normalizeOutput(resetPreset: boolean): void {
    if (resetPreset) presetId = ''
    subtitleOverrides = {}
    if (options.quality !== 'original' && options.videoCodec === 'copy') options.videoCodec = 'h264'
    if (options.subtitleStrategy === 'burn') {
      const firstText = source?.subtitles.find((subtitle) => subtitle.isText)
      if (selectedSubtitles.length === 0 && firstText) selectedSubtitles = [firstText.index]
      else selectedSubtitles = selectedSubtitles.slice(0, 1)
      if (options.videoCodec === 'copy') options.videoCodec = 'h264'
    }
  }

  function buildRequest(): {
    movieId: string
    mediaSourceId?: string
    options: DownloadOptionsInput
  } | null {
    if (!detail || !source) return null
    const overrides: Record<string, SubtitlePackaging> = {}
    for (const [index, value] of Object.entries(subtitleOverrides)) {
      if (selectedSubtitles.includes(Number(index))) overrides[index] = value
    }
    return {
      movieId: detail.id,
      mediaSourceId: source.id,
      options: {
        ...options,
        audioSelection: 'all',
        audioStreamIndices: selectedAudio,
        subtitleSelection: 'all',
        subtitleStreamIndices: selectedSubtitles,
        subtitlePackaging: Object.keys(overrides).length ? overrides : undefined,
      },
    }
  }

  async function checkLocalDownloads(signal: AbortSignal): Promise<void> {
    const body = buildRequest()
    if (!body) return
    cacheLoading = true
    try {
      const response = await fetch('/api/v1/local-downloads/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
      cache = response.ok ? ((await response.json()) as LocalDownloadsCheckResult) : null
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) cache = null
    } finally {
      if (!signal.aborted) cacheLoading = false
    }
  }

  $effect(() => {
    const dependency = JSON.stringify({
      movieId: detail?.id,
      sourceId: source?.id,
      options,
      selectedAudio,
      selectedSubtitles,
      subtitleOverrides,
    })
    if (seriesListMode || !detail || !source || detailLoading) return
    void dependency
    const controller = new AbortController()
    const timer = setTimeout(() => void checkLocalDownloads(controller.signal), 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  })

  function stopPolling(): void {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function singleJobLabel(): string {
    return detail?.title ?? activeItem.title
  }

  function notifyJobState(status: DownloadJobStatus | null): void {
    if (!status) return
    if (status.state !== 'queued' && status.state !== 'ready' && status.state !== 'failed') return
    const key = `${status.id}:${status.state}`
    if (notifiedJobStates.has(key)) return
    notifiedJobStates.add(key)
    const name =
      status.state === 'ready' ? (status.output?.filename ?? singleJobLabel()) : singleJobLabel()
    if (status.state === 'queued') {
      notifications.notify({ level: 'info', message: i18n.t('notice.downloadQueued', { name }) })
    } else if (status.state === 'ready') {
      notifications.notify({ level: 'success', message: i18n.t('notice.downloadReady', { name }) })
    } else {
      notifications.notify({ level: 'error', message: i18n.t('notice.downloadFailed', { name }) })
    }
  }

  async function pollJob(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/v1/downloads/${id}`)
      if (response.ok) {
        job = (await response.json()) as DownloadJobStatus
        notifyJobState(job)
        notifyStored()
        if (job.state === 'ready' || job.state === 'failed' || job.state === 'cancelled') {
          void queue.refresh()
        }
        if (job.state === 'queued' || job.state === 'running') {
          pollTimer = setTimeout(() => void pollJob(id), 1000)
          return
        }
      }
    } catch {
      pollTimer = setTimeout(() => void pollJob(id), 1500)
      return
    }
    pollTimer = null
  }

  async function startDownload(): Promise<void> {
    const body = buildRequest()
    if (!body) return
    submitting = true
    storedNotified = false
    jobError = null
    stopPolling()
    try {
      const response = await fetch('/api/v1/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload: unknown = await response.json()
      if (!response.ok) {
        jobError = errorMessage(payload, i18n.t('job.error'))
        notifications.notify({ level: 'error', message: jobError })
        return
      }
      job = payload as DownloadJobStatus
      notifyJobState(job)
      notifyStored()
      void queue.refresh()
      if (job.state !== 'ready') void pollJob(job.id)
      else cache = cache ? { ...cache, hit: true } : cache
    } catch {
      jobError = i18n.t('errors.JELLYFIN_ERROR')
      notifications.notify({ level: 'error', message: jobError })
    } finally {
      submitting = false
    }
  }

  function notifyStored(): void {
    if (storedNotified || !job || job.state !== 'ready' || !job.stored || job.cached) return
    storedNotified = true
    const itemId = activeItem.id
    onstored?.(itemId)
    adjustEpisodeCount(itemId, 1)
    if (downloadsLoaded) downloadsTotal += 1
    if (isSeries && movie.id !== itemId) onstored?.(movie.id)
    void loadDownloads()
  }

  async function confirmCurrentCancel(): Promise<void> {
    const target = pendingJobCancel
    if (!target) return
    cancellingJob = true
    const result = await queue.cancelJob(target.id)
    cancellingJob = false
    pendingJobCancel = null
    if (!result.ok) {
      notifications.notify({
        level: 'error',
        message: i18n.error(result.code, i18n.t('queue.cancelError')),
      })
      return
    }
    if (result.job) job = result.job
    notifications.notify({
      level: 'success',
      message: i18n.t('queue.cancelled', { name: target.title }),
    })
  }

  async function confirmBatchCancel(): Promise<void> {
    const target = pendingBatchCancel
    if (!target) return
    cancellingJob = true
    const result = await queue.cancelJob(target.job.id)
    cancellingJob = false
    pendingBatchCancel = null
    if (!result.ok) {
      notifications.notify({
        level: 'error',
        message: i18n.error(result.code, i18n.t('queue.cancelError')),
      })
      return
    }
    if (result.job) {
      const updated = result.job
      batchJobs = batchJobs.map((item) =>
        item.job.id === updated.id ? { ...item, job: updated } : item
      )
    }
    notifications.notify({
      level: 'success',
      message: i18n.t('queue.cancelled', { name: target.title }),
    })
  }

  function stopBatchPolling(): void {
    batchPollGeneration += 1
    if (batchPollTimer) {
      clearTimeout(batchPollTimer)
      batchPollTimer = null
    }
  }

  function resetBatch(): void {
    stopBatchPolling()
    batchMode = false
    batchConfigure = false
    batchSelected = []
    batchPresetId = ''
    batchJobs = []
    batchError = null
    batchSubmitting = false
    batchOptions = initialBatchOptions()
    batchNotified.clear()
  }

  function startBatchSelection(): void {
    resetBatch()
    batchMode = true
    activeTab = 'details'
  }

  function exitBatchSelection(): void {
    resetBatch()
  }

  function isBatchSelected(id: string): boolean {
    return batchSelected.includes(id)
  }

  function toggleBatchEpisode(id: string): void {
    batchSelected = batchSelected.includes(id)
      ? batchSelected.filter((value) => value !== id)
      : [...batchSelected, id]
  }

  function seasonAllSelected(episodes: MovieSummary[]): boolean {
    return episodes.length > 0 && episodes.every((episode) => batchSelected.includes(episode.id))
  }

  function toggleBatchSeason(episodes: MovieSummary[], checked: boolean): void {
    const ids = episodes.map((episode) => episode.id)
    batchSelected = checked
      ? [...new Set([...batchSelected, ...ids])]
      : batchSelected.filter((id) => !ids.includes(id))
  }

  function selectAllEpisodes(): void {
    batchSelected = (series?.episodes ?? []).map((episode) => episode.id)
  }

  function clearBatchSelection(): void {
    batchSelected = []
  }

  function configureBatch(): void {
    if (batchSelected.length === 0) {
      notifications.notify({ level: 'warn', message: i18n.t('detail.series.noSelection') })
      return
    }
    batchConfigure = true
    batchError = null
  }

  function applyBatchPreset(id: string): void {
    batchPresetId = id
    if (!id) return
    const preset = settings.presets.find((candidate) => candidate.id === id)
    if (!preset) return
    batchOptions = { ...batchOptions, ...preset.options }
    normalizeBatchOutput()
  }

  function normalizeBatchOutput(): void {
    if (batchOptions.quality !== 'original' && batchOptions.videoCodec === 'copy') {
      batchOptions.videoCodec = 'h264'
    }
    if (batchOptions.subtitleStrategy === 'burn' && batchOptions.videoCodec === 'copy') {
      batchOptions.videoCodec = 'h264'
    }
  }

  function batchSelectionValue(value: TrackSelection | undefined): 'all' | 'default' | 'none' {
    return value === 'default' || value === 'none' ? value : 'all'
  }

  function setBatchSelection(kind: 'audio' | 'subtitle', value: string): void {
    if (value !== 'all' && value !== 'default' && value !== 'none') return
    if (kind === 'audio') batchOptions.audioSelection = value
    else batchOptions.subtitleSelection = value
  }

  function batchJobTitle(movieId: string): string {
    const episode = series?.episodes.find((candidate) => candidate.id === movieId)
    return episode
      ? i18n.t('batch.job', { code: episodeCode(episode), title: episode.title })
      : movieId
  }

  function batchPending(): boolean {
    return batchJobs.some((item) => !terminalStates.has(item.job.state))
  }

  function handleBatchJob(item: { movieId: string; title: string; job: DownloadJobStatus }): void {
    if (item.job.state === 'ready') {
      const key = `${item.job.id}:ready`
      if (batchNotified.has(key)) return
      batchNotified.add(key)
      notifications.notify({
        level: 'success',
        message: i18n.t('notice.downloadReady', {
          name: item.job.output?.filename ?? item.title,
        }),
      })
      if (item.job.stored && !item.job.cached) {
        onstored?.(item.movieId)
        adjustEpisodeCount(item.movieId, 1)
        if (movie.id !== item.movieId) onstored?.(movie.id)
      }
      return
    }
    if (item.job.state !== 'failed') return
    const key = `${item.job.id}:failed`
    if (batchNotified.has(key)) return
    batchNotified.add(key)
    notifications.notify({
      level: 'error',
      message: i18n.t('notice.downloadFailed', { name: item.title }),
    })
  }

  async function pollBatch(): Promise<void> {
    const generation = batchPollGeneration
    const pending = batchJobs.filter((item) => !terminalStates.has(item.job.state))
    if (pending.length === 0) {
      stopBatchPolling()
      void loadDownloads()
      return
    }
    const updates = await Promise.all(
      pending.map(async (item) => {
        try {
          const response = await fetch(`/api/v1/downloads/${item.job.id}`)
          if (!response.ok) return null
          return { id: item.job.id, job: (await response.json()) as DownloadJobStatus }
        } catch {
          return null
        }
      })
    )
    if (generation !== batchPollGeneration) return
    const nextById = new Map(
      updates
        .filter((update): update is { id: string; job: DownloadJobStatus } => update !== null)
        .map((update) => [update.id, update.job])
    )
    batchJobs = batchJobs.map((item) => {
      const next = nextById.get(item.job.id)
      return next ? { ...item, job: next } : item
    })
    for (const item of batchJobs) handleBatchJob(item)
    if (batchPending()) {
      batchPollTimer = setTimeout(() => void pollBatch(), 1500)
      return
    }
    stopBatchPolling()
    void queue.refresh()
    void loadDownloads()
  }

  function startBatchPolling(): void {
    stopBatchPolling()
    if (!batchPending()) {
      void loadDownloads()
      return
    }
    batchPollTimer = setTimeout(() => void pollBatch(), 1500)
  }

  async function startBatch(): Promise<void> {
    if (batchSubmitting) return
    const ids = [...batchSelected]
    if (ids.length === 0) {
      notifications.notify({ level: 'warn', message: i18n.t('detail.series.noSelection') })
      return
    }
    batchSubmitting = true
    batchError = null
    try {
      const response = await fetch('/api/v1/downloads/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieIds: ids,
          preset: batchPresetId || undefined,
          options: {
            ...batchOptions,
            audioStreamIndices: undefined,
            subtitleStreamIndices: undefined,
            subtitlePackaging: undefined,
          },
        }),
      })
      const payload: unknown = await response.json()
      if (!response.ok) {
        batchError = errorMessage(payload, i18n.t('detail.series.error'))
        notifications.notify({ level: 'error', message: batchError })
        return
      }
      const result = payload as BatchDownloadResult
      const failed = new Set(result.errors.map((error) => error.movieId))
      const createdIds = ids.filter((id) => !failed.has(id))
      batchJobs = result.jobs.map((status, index) => {
        const movieId = createdIds[index] ?? ids[index] ?? ''
        return { movieId, title: batchJobTitle(movieId), job: status }
      })
      void queue.refresh()
      for (const item of batchJobs) handleBatchJob(item)
      if (result.jobs.length > 0) {
        notifications.notify({
          level: 'success',
          message: i18n.t('notice.batchCreated', { count: result.jobs.length }),
        })
      }
      if (result.errors.length > 0) {
        notifications.notify({
          level: 'warn',
          message: i18n.t('notice.batchErrors', { count: result.errors.length }),
        })
      }
      startBatchPolling()
    } catch {
      batchError = i18n.t('errors.JELLYFIN_ERROR')
      notifications.notify({ level: 'error', message: batchError })
    } finally {
      batchSubmitting = false
    }
  }

  function sourceSubtitleLabel(format: string, isExternal: boolean): string {
    return i18n.t('subtitles.format', {
      format: format.toUpperCase(),
      kind: i18n.t(isExternal ? 'subtitles.external' : 'subtitles.embedded'),
    })
  }
</script>

<ModalShell title={dialogTitle} {open} {onclose}>
  <div class="detail">
    <Tabs
      tabs={tabItems}
      bind:active={activeTab}
      label={i18n.t('detail.tabsLabel')}
      idPrefix="movie-detail"
      sticky
    />

    {#if isSeries && selectedEpisode}
      <button type="button" class="back-button hover-shine modal-back" onclick={backToSeries}>
        <span class="back-icon" aria-hidden="true">←</span>
        {i18n.t('detail.series.back')}
      </button>
    {/if}

    {#if activeTab === 'details'}
      <div
        class="tab-panel"
        id="movie-detail-panel-details"
        role="tabpanel"
        aria-labelledby="movie-detail-tab-details"
        aria-busy={downloadsLoading || detailLoading}
      >
        {#if seriesListMode}
          {#if seriesLoading}
            <div class="empty">
              <strong>{i18n.t('detail.series.loading')}</strong>
            </div>
          {:else if seriesError}
            <div class="error-box" role="alert">{seriesError}</div>
          {:else if !series || series.episodes.length === 0}
            <div class="empty">
              <strong>{i18n.t('detail.series.empty')}</strong>
            </div>
          {:else}
            <div class="detail-grid">
              {#if posterTag}
                <img
                  class="detail-poster"
                  src={`/api/v1/artwork/${posterId}?tag=${encodeURIComponent(posterTag)}&w=300`}
                  alt=""
                />
              {:else}
                <div class="detail-poster"></div>
              {/if}
              <div>
                <h2>{series.title}</h2>
                <div class="muted">
                  {series.year ?? movie.year ?? i18n.t('movies.unknownYear')} ·
                  {i18n.t('detail.series.episodes', { count: series.episodes.length })}
                  {#if seriesSizeLoading}
                    · <span class="size-pending" role="status">
                      <span class="loading-dot" aria-hidden="true"></span>
                      {i18n.t('detail.series.calculatingSize')}
                    </span>
                  {:else if seriesSizeBytes}
                    · <span title={i18n.t('detail.badge.size')}>
                      {formatBytes(seriesSizeBytes, i18n.locale)}
                    </span>
                  {/if}
                </div>
                {#if series.unavailableEpisodes > 0}
                  <p class="note warn small" style="margin-top: .45rem;">
                    {i18n.t('detail.series.unavailable', {
                      count: series.unavailableEpisodes,
                    })}
                  </p>
                {/if}
                {#if series.overview}<p class="overview">{series.overview}</p>{/if}
                <div class="series-head-actions">
                  <a
                    class="badge accent hover-shine"
                    href={`/watch/${movie.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title={i18n.t('detail.play')}
                  >
                    <Icon name="play" size={14} />
                    {i18n.t('detail.play')}
                  </a>
                  {#if batchMode}
                    <button type="button" class="ghost hover-shine" onclick={exitBatchSelection}>
                      {i18n.t('detail.series.exitSelection')}
                    </button>
                  {:else}
                    <button type="button" class="ghost hover-shine" onclick={startBatchSelection}>
                      <Icon name="download" size={14} />
                      {i18n.t('detail.series.downloadEpisodes')}
                    </button>
                  {/if}
                </div>
              </div>
            </div>

            {#if batchConfigure}
              <div class="batch-config">
                <button
                  type="button"
                  class="back-button hover-shine"
                  onclick={() => (batchConfigure = false)}
                >
                  <span class="back-icon" aria-hidden="true">←</span>
                  {i18n.t('detail.series.back')}
                </button>

                <div class="section">
                  <p class="section-title">
                    {i18n.t('detail.series.batchTitle', { count: batchSelected.length })}
                  </p>
                  <p class="muted small batch-hint">{i18n.t('detail.series.batchHint')}</p>

                  <div class="panel-head" style="padding: 0 0 .75rem; border: 0;">
                    <label class="small" for="batch-preset">{i18n.t('options.preset')}</label>
                    <select
                      id="batch-preset"
                      value={batchPresetId}
                      onchange={(event) =>
                        applyBatchPreset((event.currentTarget as HTMLSelectElement).value)}
                    >
                      <option value="">{i18n.t('options.custom')}</option>
                      {#each settings.presets as preset (preset.id)}
                        <option value={preset.id}>{preset.name}</option>
                      {/each}
                    </select>
                  </div>

                  <OutputSettings
                    bind:options={batchOptions}
                    {capabilities}
                    defaultContainer={detail?.defaultContainer ?? 'mkv'}
                    onchange={normalizeBatchOutput}
                    onqualitychange={(quality) => {
                      if (quality !== 'original' && batchOptions.videoCodec === 'copy') {
                        batchOptions.videoCodec = 'h264'
                      }
                    }}
                  />

                  <div class="batch-selection">
                    <div class="field">
                      <label for="batch-audio-selection">
                        {i18n.t('detail.series.audioSelection')}
                      </label>
                      <select
                        id="batch-audio-selection"
                        value={batchSelectionValue(batchOptions.audioSelection)}
                        onchange={(event) =>
                          setBatchSelection(
                            'audio',
                            (event.currentTarget as HTMLSelectElement).value
                          )}
                      >
                        <option value="all">{i18n.t('settings.selectionAll')}</option>
                        <option value="default">{i18n.t('settings.selectionDefault')}</option>
                        <option value="none">{i18n.t('settings.selectionNone')}</option>
                      </select>
                    </div>
                    <div class="field">
                      <label for="batch-subtitle-selection">
                        {i18n.t('detail.series.subtitleSelection')}
                      </label>
                      <select
                        id="batch-subtitle-selection"
                        value={batchSelectionValue(batchOptions.subtitleSelection)}
                        onchange={(event) =>
                          setBatchSelection(
                            'subtitle',
                            (event.currentTarget as HTMLSelectElement).value
                          )}
                      >
                        <option value="all">{i18n.t('settings.selectionAll')}</option>
                        <option value="default">{i18n.t('settings.selectionDefault')}</option>
                        <option value="none">{i18n.t('settings.selectionNone')}</option>
                      </select>
                    </div>
                  </div>

                  <div class="actions">
                    <button
                      type="button"
                      class="primary hover-shine"
                      disabled={batchSubmitting || batchSelected.length === 0}
                      onclick={() => void startBatch()}
                    >
                      <Icon name="download" size={17} />
                      {batchSubmitting ? i18n.t('batch.starting') : i18n.t('batch.start')}
                    </button>
                  </div>

                  {#if batchError}
                    <div class="error-box" role="alert">{batchError}</div>
                  {/if}

                  <BatchPanel items={batchJobs} oncancel={(item) => (pendingBatchCancel = item)} />
                </div>
              </div>
            {:else}
              {#if batchMode}
                <div class="batch-toolbar" role="group" aria-label={i18n.t('batch.title')}>
                  <button type="button" class="ghost hover-shine" onclick={selectAllEpisodes}>
                    {i18n.t('detail.series.selectAll')}
                  </button>
                  <button
                    type="button"
                    class="ghost hover-shine"
                    disabled={batchSelected.length === 0}
                    onclick={clearBatchSelection}
                  >
                    {i18n.t('detail.series.clearSelection')}
                  </button>
                  <span class="muted small" aria-live="polite">
                    {i18n.t('detail.series.selected', { count: batchSelected.length })}
                  </span>
                  <span class="spacer"></span>
                  <button type="button" class="primary hover-shine" onclick={configureBatch}>
                    {i18n.t('detail.series.configureSelected')}
                  </button>
                </div>
              {/if}

              <div class="series-seasons">
                {#each seasons as group (group.season)}
                  <section class="series-season" aria-label={group.label}>
                    <div class="season-head">
                      <button
                        type="button"
                        class="season-toggle"
                        aria-expanded={seasonOpen(group.season)}
                        onclick={() => toggleSeason(group.season)}
                      >
                        <span
                          class="season-chevron"
                          class:open={seasonOpen(group.season)}
                          aria-hidden="true"
                        >
                          ▸
                        </span>
                        <span class="section-title">{group.label}</span>
                        <span class="muted small">
                          {i18n.t('detail.series.episodes', { count: group.episodes.length })}
                        </span>
                      </button>
                      {#if batchMode}
                        <label class="season-check">
                          <input
                            type="checkbox"
                            checked={seasonAllSelected(group.episodes)}
                            aria-label={i18n.t('detail.series.selectSeason', {
                              season: group.label,
                            })}
                            onchange={(event) =>
                              toggleBatchSeason(
                                group.episodes,
                                (event.currentTarget as HTMLInputElement).checked
                              )}
                          />
                          <span class="muted small">
                            {i18n.t('detail.series.selected', {
                              count: group.episodes.filter((episode) => isBatchSelected(episode.id))
                                .length,
                            })}
                          </span>
                        </label>
                      {/if}
                    </div>
                    {#if seasonOpen(group.season)}
                      <div class="episode-list">
                        {#each group.episodes as episode (episode.id)}
                          <div
                            class={[
                              'episode-row',
                              { selected: batchMode && isBatchSelected(episode.id) },
                            ]}
                          >
                            {#if batchMode}
                              <input
                                class="episode-check"
                                type="checkbox"
                                checked={isBatchSelected(episode.id)}
                                aria-label={i18n.t('batch.job', {
                                  code: episodeCode(episode),
                                  title: episode.title,
                                })}
                                onchange={() => toggleBatchEpisode(episode.id)}
                              />
                            {/if}
                            <button
                              type="button"
                              class="episode-open"
                              aria-pressed={batchMode ? isBatchSelected(episode.id) : undefined}
                              onclick={() =>
                                batchMode ? toggleBatchEpisode(episode.id) : selectEpisode(episode)}
                            >
                              <span class="episode-code">{episodeCode(episode)}</span>
                              <span class="episode-main">
                                <span class="episode-title">{episode.title}</span>
                                <span class="muted small">
                                  {formatDuration(episode.runtimeSeconds)}
                                </span>
                              </span>
                            </button>
                            {#if episode.downloadCount > 0}
                              <span class="badge good episode-downloads">
                                <Icon name="download" size={12} />
                                {episode.downloadCount}
                              </span>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </section>
                {/each}
              </div>
            {/if}
          {/if}
        {:else}
          <div class="detail-grid">
            {#if posterTag}
              <img
                class="detail-poster"
                src={`/api/v1/artwork/${posterId}?tag=${encodeURIComponent(posterTag)}&w=300`}
                alt=""
              />
            {:else}
              <div class="detail-poster"></div>
            {/if}
            <div>
              {#if activeItem.kind === 'episode'}
                <p class="episode-context muted small">
                  {activeItem.seriesName ?? movie.title} · {episodeCode(activeItem)}
                </p>
              {/if}
              <h2>{detail?.title ?? activeItem.title}</h2>
              <div class="muted">
                {detail?.year ?? activeItem.year ?? i18n.t('movies.unknownYear')} ·
                {formatDuration(detail?.runtimeSeconds ?? activeItem.runtimeSeconds)}
                {#if source?.sizeBytes}
                  · <span title={i18n.t('detail.badge.size')}>
                    {formatBytes(source.sizeBytes, i18n.locale)}
                  </span>
                {/if}
              </div>
              <div class="movie-badges" style="margin-top: .45rem;">
                {#if resolution}
                  <span class="badge accent" title={i18n.t('detail.badge.resolution')}>
                    {resolution}p
                  </span>
                {/if}
                <span class="badge" title={i18n.t('detail.badge.container')}>
                  {(source?.container ?? activeItem.media?.container ?? '—').toUpperCase()}
                </span>
                {#if audioLanguages.length}
                  <span class="badge" title={i18n.t('detail.badge.audio')}>
                    {audioLanguages
                      .map((language) => formatLanguage(language, i18n.locale))
                      .join(' · ')}
                  </span>
                {/if}
                {#if subtitleCount > 0}
                  <span class="badge" title={i18n.t('detail.badge.subtitles')}>
                    {i18n.t('movies.subtitleCount', { count: subtitleCount })}
                  </span>
                {/if}
                <!-- {#if activeItem.downloadCount > 0}
                  <span class="badge good">
                    {i18n.t('movies.downloadsCount', { count: activeItem.downloadCount })}
                  </span>
                {/if} -->
              </div>
              <div class="title-actions">
                <a
                  class="badge accent hover-shine"
                  href={`/watch/${activeItem.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title={i18n.t('detail.play')}
                >
                  <Icon name="play" size={14} />
                  {i18n.t('detail.play')}
                </a>
              </div>
              {#if detail?.sources.length && detail.sources.length > 1}
                <div class="field" style="margin-top: .7rem; max-width: 30rem;">
                  <label for="source">{i18n.t('detail.source')}</label>
                  <select
                    id="source"
                    value={source?.id}
                    onchange={(event) =>
                      changeSource((event.currentTarget as HTMLSelectElement).value)}
                  >
                    {#each detail.sources as candidate (candidate.id)}
                      <option value={candidate.id}>
                        {candidate.name} · {candidate.container.toUpperCase()} ·
                        {formatBytes(candidate.sizeBytes, i18n.locale)}
                      </option>
                    {/each}
                  </select>
                </div>
              {/if}
              {#if detail?.overview}<p class="overview">{detail.overview}</p>{/if}
            </div>
          </div>

          {#if detailLoading}
            <div class="empty">
              <strong>{i18n.t('detail.loading')}</strong>{i18n.t('detail.loadingHint')}
            </div>
          {:else if detailError}
            <div class="error-box" role="alert">{detailError}</div>
          {:else if !detail || !source}
            <div class="empty">
              <strong>{i18n.t('detail.selectTitle')}</strong>{i18n.t('detail.selectHint')}
            </div>
          {:else}
            <CollapsibleSection
              id="output"
              title={i18n.t('options.title')}
              bind:open={sectionOpen.output}
            >
              {#snippet actions()}
                <select
                  aria-label={i18n.t('options.preset')}
                  value={presetId}
                  onchange={(event) =>
                    applyPreset((event.currentTarget as HTMLSelectElement).value)}
                >
                  <option value="">{i18n.t('options.custom')}</option>
                  {#each settings.presets as preset (preset.id)}
                    <option value={preset.id}>{preset.name}</option>
                  {/each}
                </select>
              {/snippet}
              <OutputSettings
                bind:options
                {capabilities}
                defaultContainer={detail.defaultContainer}
                showHardware
                sourceHeight={resolution}
                onchange={outputChanged}
                onqualitychange={(quality) => {
                  if (quality !== 'original' && options.videoCodec === 'copy') {
                    options.videoCodec = 'h264'
                  }
                }}
              />
            </CollapsibleSection>

            <CollapsibleSection
              id="audio"
              title={i18n.t('audio.title', {
                selected: selectedAudio.length,
                total: source.audio.length,
              })}
              bind:open={sectionOpen.audio}
            >
              {#snippet actions()}
                <button
                  type="button"
                  class="ghost hover-shine track-action"
                  disabled={source.audio.length === 0 || allAudioSelected}
                  onclick={selectAllAudio}
                >
                  {i18n.t('detail.tracks.selectAll')}
                </button>
                <button
                  type="button"
                  class="ghost hover-shine track-action"
                  disabled={selectedAudio.length === 0}
                  onclick={clearAudioSelection}
                >
                  {i18n.t('detail.tracks.clearSelection')}
                </button>
              {/snippet}
              {#if source.audio.length === 0}
                <p class="muted small">{i18n.t('audio.empty')}</p>
              {:else}
                <div class="check-list">
                  {#each source.audio as track (track.index)}
                    <label class="check-row">
                      <input
                        type="checkbox"
                        checked={selectedAudio.includes(track.index)}
                        onchange={(event) =>
                          toggleAudio(
                            track.index,
                            (event.currentTarget as HTMLInputElement).checked
                          )}
                      />
                      <span class="grow">
                        <span class="track-title">
                          {formatLanguage(track.language, i18n.locale)} · {track.codec.toUpperCase()}
                          {#if track.channels}
                            · {i18n.t('audio.channels', { count: track.channels })}{/if}
                        </span>
                        <span class="muted small">
                          {track.displayTitle ??
                            track.title ??
                            i18n.t('audio.track', { index: track.index })}
                        </span>
                      </span>
                      {#if track.isDefault}
                        <span class="badge accent">{i18n.t('audio.default')}</span>
                      {/if}
                    </label>
                  {/each}
                </div>
              {/if}
            </CollapsibleSection>

            <CollapsibleSection
              id="subtitles"
              title={i18n.t('subtitles.title', {
                selected: selectedSubtitles.length,
                total: source.subtitles.length,
              })}
              bind:open={sectionOpen.subtitles}
            >
              {#snippet actions()}
                {#if source.subtitles.length > 0 && options.subtitleStrategy !== 'none'}
                  {#if options.subtitleStrategy !== 'burn'}
                    <button
                      type="button"
                      class="ghost hover-shine track-action"
                      disabled={allSubtitlesSelected}
                      onclick={selectAllSubtitles}
                    >
                      {i18n.t('detail.tracks.selectAll')}
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="ghost hover-shine track-action"
                    disabled={selectedSubtitles.length === 0}
                    onclick={clearSubtitleSelection}
                  >
                    {i18n.t('detail.tracks.clearSelection')}
                  </button>
                {/if}
              {/snippet}
              {#if options.subtitleStrategy === 'burn'}
                <p class="note warn small" style="margin-bottom: .6rem;">
                  {i18n.t('subtitles.burnHint')}
                </p>
              {/if}
              {#if source.subtitles.length === 0}
                <p class="muted small">{i18n.t('subtitles.empty')}</p>
              {:else if options.subtitleStrategy === 'none'}
                <p class="note small">{i18n.t('subtitles.noneHint')}</p>
              {:else}
                <div class="check-list">
                  {#each source.subtitles as subtitle (subtitle.index)}
                    <div class="check-row">
                      <input
                        id={`subtitle-${subtitle.index}`}
                        type="checkbox"
                        checked={selectedSubtitles.includes(subtitle.index)}
                        disabled={options.subtitleStrategy === 'burn' &&
                          selectedSubtitles.length > 0 &&
                          !selectedSubtitles.includes(subtitle.index)}
                        onchange={(event) =>
                          toggleSubtitle(
                            subtitle.index,
                            (event.currentTarget as HTMLInputElement).checked
                          )}
                      />
                      <label class="grow" for={`subtitle-${subtitle.index}`}>
                        <span class="track-title">
                          {formatLanguage(subtitle.language, i18n.locale)} ·
                          {sourceSubtitleLabel(subtitle.format, subtitle.isExternal)}
                        </span>
                        <span class="muted small">
                          {subtitle.displayTitle ??
                            subtitle.title ??
                            i18n.t('subtitles.track', { index: subtitle.index })}
                          {#if subtitle.isDefault}
                            · {i18n.t('subtitles.default')}{/if}
                          {#if subtitle.isForced}
                            · {i18n.t('subtitles.forced')}{/if}
                        </span>
                      </label>
                      {#if selectedSubtitles.includes(subtitle.index) && options.subtitleStrategy !== 'burn'}
                        <select
                          aria-label={i18n.t('subtitles.packagingAria')}
                          value={subtitleOverrides[subtitle.index] ?? 'auto'}
                          onchange={(event) =>
                            setSubtitleOverride(
                              subtitle.index,
                              (event.currentTarget as HTMLSelectElement).value
                            )}
                        >
                          <option value="auto">
                            {i18n.t('subtitles.auto', {
                              mode:
                                effectiveSubtitlePackaging(subtitle) === 'separate'
                                  ? i18n.t('subtitles.separate')
                                  : i18n.t('subtitles.integrated'),
                            })}
                          </option>
                          <option value="mux">{i18n.t('subtitles.integrated')}</option>
                          <option value="separate">{i18n.t('subtitles.separate')}</option>
                        </select>
                      {/if}
                      <span
                        class={[
                          'badge',
                          {
                            good: effectiveSubtitlePackaging(subtitle) === 'mux',
                            accent: effectiveSubtitlePackaging(subtitle) === 'separate',
                            warn: effectiveSubtitlePackaging(subtitle) === 'burn',
                          },
                        ]}
                      >
                        {effectiveSubtitlePackaging(subtitle) === 'mux'
                          ? i18n.t('subtitles.integrated')
                          : effectiveSubtitlePackaging(subtitle) === 'separate'
                            ? i18n.t('subtitles.separate')
                            : i18n.t('subtitles.burned')}
                      </span>
                    </div>
                  {/each}
                </div>
              {/if}
            </CollapsibleSection>

            <div class="section">
              <p class="section-title">{i18n.t('result.output')}</p>
              <div class={['note', { good: cache?.enabled && cache.hit }]}>
                {#if cacheLoading}
                  {i18n.t('result.checking')}
                {:else if cache?.enabled && cache.hit}
                  <strong>{i18n.t('result.available')}</strong>
                  {cache.filename} · {formatBytes(cache.sizeBytes, i18n.locale)} ·
                  {formatTimestamp(cache.createdAt, i18n.locale)}
                {:else if cache?.enabled}
                  {i18n.t('result.willStore')}
                {:else}
                  {i18n.t('result.noStore')}
                {/if}
              </div>

              <div class="filename-preview" role="note" aria-label={i18n.t('result.filename')}>
                <span class="filename-label">{i18n.t('result.filename')}</span>
                <span class="filename-value">{filenamePreview}</span>
                <span class="muted small">{i18n.t('result.filenameHint')}</span>
              </div>

              <div class="actions">
                <button class="primary hover-shine" disabled={!canDownload} onclick={startDownload}>
                  <Icon name="download" size={17} />
                  {submitting
                    ? i18n.t('result.creating')
                    : cache?.enabled && cache.hit
                      ? i18n.t('result.downloadCache')
                      : i18n.t('result.download')}
                </button>
                <span class="spacer"></span>
                <span class="muted small">
                  {#if options.quality === 'original' && options.videoCodec === 'copy'}
                    {i18n.t('result.noReencode')}
                  {:else}
                    {i18n.t('result.expected', {
                      quality: options.quality ?? '',
                      codec: options.videoCodec ?? '',
                    })}
                  {/if}
                  {#if outputKind === 'zip'}
                    · {i18n.t('result.files', { count: expectedFiles })}
                  {/if}
                </span>
              </div>

              <JobPanel
                {job}
                error={jobError}
                cancelling={cancellingJob}
                oncancel={() => (pendingJobCancel = job)}
              />
            </div>
          {/if}
        {/if}
      </div>
    {:else if activeTab === 'downloads'}
      <div
        class="tab-panel"
        id="movie-detail-panel-downloads"
        role="tabpanel"
        aria-labelledby="movie-detail-tab-downloads"
        aria-busy={downloadsLoading || detailLoading}
      >
        <div class="dialog-downloads">
          <div class="downloads-head">
            <p class="section-title" style="margin: 0;">{i18n.t('detail.tab.downloads')}</p>
            <button
              type="button"
              class="ghost hover-shine"
              disabled={downloadsLoading}
              onclick={() => void loadDownloads()}
            >
              {i18n.t('detail.downloads.refresh')}
            </button>
          </div>

          <div class="downloads-status" aria-live="polite">
            {#if downloadsError}
              <div class="error-box" role="alert">{downloadsError}</div>
            {/if}
          </div>

          {#if downloadsLoading && downloads.length === 0}
            <p class="muted small" role="status" aria-live="polite">{i18n.t('common.loading')}</p>
          {:else if !downloadsEnabled}
            <p class="note">{i18n.t('detail.downloads.disabled')}</p>
          {:else if downloads.length === 0}
            <div class="empty">
              <strong>{i18n.t('detail.downloads.empty')}</strong>
              {i18n.t('detail.downloads.emptyHint')}
            </div>
          {:else}
            <div class="dialog-download-list">
              {#each downloads as item (item.key)}
                <article class="dialog-download">
                  <div class="dialog-download-main">
                    <span class="dialog-download-name">{item.filename}</span>
                    <span class="download-meta">
                      <span>
                        {item.kind === 'zip' ? i18n.t('downloads.zip') : i18n.t('downloads.file')}
                      </span>
                      <span>{formatBytes(item.sizeBytes, i18n.locale)}</span>
                      {#if item.processingMs}
                        <span title={i18n.t('common.processedHint')}>
                          {i18n.t('common.processedIn', {
                            time: formatProcessingTime(item.processingMs),
                          })}
                        </span>
                      {/if}
                      <span>{formatTimestamp(item.createdAt, i18n.locale)}</span>
                    </span>
                    <DownloadConfigBadge
                      config={item.config}
                      movieId={item.movieId}
                      downloadKey={item.key}
                      compact
                    />
                  </div>
                  <div class="download-actions">
                    <a class="badge good hover-shine" href={item.downloadUrl} download>
                      <Icon name="download" size={14} />
                      {i18n.t('downloads.download')}
                    </a>
                    <button
                      type="button"
                      class="danger icon-btn hover-shine"
                      disabled={deleting}
                      onclick={() => (pendingDelete = item)}
                      aria-label={i18n.t('common.delete')}
                      title={i18n.t('common.delete')}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div
        class="tab-panel"
        id="movie-detail-panel-queue"
        role="tabpanel"
        aria-labelledby="movie-detail-tab-queue"
      >
        <div class="dialog-downloads">
          <div class="downloads-head">
            <p class="section-title" style="margin: 0;">{i18n.t('detail.tab.queue')}</p>
          </div>
          <DownloadQueue compact jobs={queueJobs} onopen={openQueuedItem} />
        </div>
      </div>
    {/if}
  </div>
</ModalShell>

<ConfirmDialog
  open={pendingDelete !== null}
  title={i18n.t('detail.downloads.deleteTitle')}
  message={i18n.t('detail.downloads.deleteMessage', { filename: pendingDelete?.filename ?? '' })}
  confirmLabel={i18n.t('common.delete')}
  busy={deleting}
  onconfirm={() => void confirmDelete()}
  oncancel={() => (pendingDelete = null)}
/>

<ConfirmDialog
  open={pendingJobCancel !== null}
  title={i18n.t('queue.cancelTitle')}
  message={i18n.t('queue.cancelMessage', { name: pendingJobCancel?.title ?? '' })}
  confirmLabel={i18n.t('queue.cancel')}
  busy={cancellingJob}
  onconfirm={() => void confirmCurrentCancel()}
  oncancel={() => (pendingJobCancel = null)}
/>

<ConfirmDialog
  open={pendingBatchCancel !== null}
  title={i18n.t('queue.cancelTitle')}
  message={i18n.t('queue.cancelMessage', { name: pendingBatchCancel?.title ?? '' })}
  confirmLabel={i18n.t('queue.cancel')}
  busy={cancellingJob}
  onconfirm={() => void confirmBatchCancel()}
  oncancel={() => (pendingBatchCancel = null)}
/>

<style>
  .title-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }

  .modal-back {
    align-self: flex-start;
    margin: 0.15rem 0 0.6rem;
  }

  .track-action {
    padding: 0.25rem 0.5rem;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .series-head-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.55rem;
  }

  .season-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .season-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    padding: 0.35rem 0.45rem;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    text-align: left;
  }

  .season-toggle:hover {
    background: var(--surface-2);
  }

  .season-toggle .section-title {
    margin: 0;
  }

  .season-chevron {
    display: inline-block;
    color: var(--muted);
    transition: transform 140ms ease;
  }

  .season-chevron.open {
    transform: rotate(90deg);
  }

  .size-pending {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .loading-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 999px;
    background: var(--accent);
    animation: size-pulse 900ms ease-in-out infinite alternate;
  }

  @keyframes size-pulse {
    from {
      opacity: 0.25;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-dot {
      animation: none;
    }
  }

  .season-check {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 500;
  }

  .episode-row.selected {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
    background: var(--accent-soft);
  }

  .episode-check {
    flex: 0 0 auto;
    margin: 0;
  }

  .episode-open {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .batch-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }

  .batch-toolbar .spacer {
    flex: 1;
  }

  .batch-hint {
    margin: 0 0 0.75rem;
  }

  .batch-selection {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
    margin: 0.85rem 0;
  }

  .filename-preview {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-top: 0.7rem;
    padding: 0.55rem 0.65rem;
    border: 1px dashed var(--line);
    border-radius: 9px;
    background: var(--surface);
  }

  .filename-label {
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .filename-value {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
</style>
