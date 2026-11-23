<script lang="ts">
  import type { PageData } from './$types'
  import type { LocalDownloadInfo, LocalDownloadsPage } from '#lib/types.js'
  import { formatBytes, formatProcessingTime, formatTimestamp } from '#lib/format.js'
  import { getI18n } from '#core/i18n.svelte.js'
  import { getNotifications } from '#core/notifications.svelte.js'
  import Icon from '#lib/components/icon.svelte'
  import EmptyState from '#lib/components/empty-state.svelte'
  import ConfirmDialog from '#lib/components/confirm-dialog.svelte'
  import DownloadConfigBadge from '#lib/ui/download-config-badge.svelte'
  import DownloadQueue from '#lib/ui/download-queue.svelte'
  import { getDownloadQueue } from '#core/download-queue.svelte.js'
  import { infiniteScroll } from '#lib/actions/infinite-scroll.js'
  import { PAGE_SIZE } from '#const'

  let { data }: { data: PageData } = $props()
  const i18n = getI18n()
  const notifications = getNotifications()
  const queue = getDownloadQueue()

  // svelte-ignore state_referenced_locally
  let items = $state<LocalDownloadInfo[]>(data.items)
  // svelte-ignore state_referenced_locally
  let total = $state(data.total)
  // svelte-ignore state_referenced_locally
  let storage = $state(data.storage)
  let loadingMore = $state(false)
  let loadRequest = 0
  let error = $state<string | null>(null)
  let deleting = $state<string | null>(null)
  let pendingDelete = $state<LocalDownloadInfo | null>(null)
  let previousActive = 0

  const hasMore = $derived(items.length < total)

  async function loadStored(append = false): Promise<void> {
    if (append && (loadingMore || !hasMore)) return
    const requestId = ++loadRequest
    const requestOffset = append ? items.length : 0
    if (append) loadingMore = true
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(requestOffset),
      })
      const response = await fetch(`/api/v1/local-downloads?${params}`)
      if (!response.ok) return
      const payload = (await response.json()) as LocalDownloadsPage
      if (requestId !== loadRequest) return
      if (append) {
        const seen = new Set(items.map((item) => item.key))
        items = [...items, ...payload.items.filter((item) => !seen.has(item.key))]
      } else {
        items = payload.items
      }
      total = payload.total ?? items.length
      storage = {
        enabled: payload.enabled,
        usedBytes: payload.usedBytes,
        objects: payload.objects,
      }
    } catch {
      // keep the current list when the refresh fails
    } finally {
      if (requestId === loadRequest) loadingMore = false
    }
  }

  function refreshStored(): Promise<void> {
    return loadStored(false)
  }

  $effect(() => {
    const active = queue.jobs.length
    if (active < previousActive) void refreshStored()
    previousActive = active
  })

  async function confirmDelete(): Promise<void> {
    const item = pendingDelete
    if (!item) return
    deleting = item.key
    error = null
    try {
      const response = await fetch(`/api/v1/local-downloads/${item.key}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) {
        error = i18n.t('errors.FILE_NOT_FOUND')
        notifications.notify({ level: 'error', message: error })
        return
      }
      items = items.filter((candidate) => candidate.key !== item.key)
      total = Math.max(0, total - 1)
      storage = {
        ...storage,
        usedBytes: Math.max(0, storage.usedBytes - item.sizeBytes),
        objects: Math.max(0, storage.objects - 1),
      }
      const notice = i18n.t('downloads.deleted')
      notifications.notify({ level: 'success', message: notice })
    } catch {
      error = i18n.t('errors.INTERNAL_ERROR')
      notifications.notify({ level: 'error', message: error })
    } finally {
      deleting = null
      pendingDelete = null
    }
  }
</script>

<div class="hero">
  <div>
    <h1>{i18n.t('downloads.title')}</h1>
    <p>{i18n.t('downloads.subtitle')}</p>
  </div>
  <div class="status-row">
    <span class={['badge', { good: storage.enabled, warn: !storage.enabled }]}>
      {storage.enabled
        ? i18n.t('settings.storageOn', {
            size: formatBytes(storage.usedBytes, i18n.locale),
          })
        : i18n.t('settings.storageOff')}
    </span>
    <a class="badge info hover-shine" href="/settings">
      <Icon name="settings" size={14} />
      {i18n.t('nav.settings')}
    </a>
  </div>
</div>

{#if data.warning}<div class="note warn" role="status">{i18n.t('errors.INTERNAL_ERROR')}</div>{/if}
{#if error}<div class="error-box" role="alert">{error}</div>{/if}

<section class="queue-section" aria-labelledby="queue-title">
  {#if queue.jobs.length > 0}
    <div class="search-meta">
      <h2 id="queue-title" class="section-title" style="margin: 0;">
        {i18n.t('downloads.active')}
      </h2>
      <span class="muted small" aria-live="polite">
        {i18n.t('queue.activeCount', { count: queue.jobs.length })}
      </span>
    </div>
  {/if}
  <DownloadQueue hideEmpty />
</section>

{#if !storage.enabled}
  <EmptyState
    icon="folder"
    title={i18n.t('downloads.disabled')}
    description={i18n.t('downloads.disabledHint')}
    variant="empty"
  />
{:else if items.length === 0 && queue.jobs.length === 0}
  <EmptyState
    icon="download"
    title={i18n.t('downloads.empty')}
    description={i18n.t('downloads.emptyHint')}
    variant="empty"
  />
{:else if items.length > 0}
  <div class="search-meta">
    <span class="muted small">{i18n.t('downloads.count', { count: total })}</span>
  </div>
  <div class="downloads-grid">
    {#each items as item (item.key)}
      {@const modalId = item.movieId}
      {@const modalHref = modalId ? `/?modal=${encodeURIComponent(modalId)}` : null}
      <article class="download-card">
        <div class="download-titles">
          <h3>
            {#if modalHref}
              <a class="download-title" href={modalHref} title={i18n.t('downloads.openInLibrary')}>
                {item.filename}
              </a>
            {:else}
              {item.filename}
            {/if}
          </h3>
          <p class="download-subtitle">
            {item.movieTitle ?? i18n.t('downloads.unknownMovie')}
            {#if item.movieYear}
              <span class="download-year">· {item.movieYear}</span>
            {/if}
          </p>
        </div>

        <dl class="download-facts">
          <div class="download-fact">
            <dt>
              <Icon name={item.kind === 'zip' ? 'archive' : 'file'} size={13} />
              {i18n.t('downloads.typeLabel')}
            </dt>
            <dd>{item.kind === 'zip' ? i18n.t('downloads.zip') : i18n.t('downloads.file')}</dd>
          </div>
          <div class="download-fact">
            <dt><Icon name="hard-drive" size={13} />{i18n.t('downloads.sizeLabel')}</dt>
            <dd>{formatBytes(item.sizeBytes, i18n.locale)}</dd>
          </div>
          <div class="download-fact" title={i18n.t('common.originalSizeHint')}>
            <dt><Icon name="film" size={13} />{i18n.t('downloads.originalLabel')}</dt>
            <dd>{item.sourceSizeBytes ? formatBytes(item.sourceSizeBytes, i18n.locale) : '—'}</dd>
          </div>
          {#if item.processingMs}
            <div class="download-fact" title={i18n.t('common.processedHint')}>
              <dt><Icon name="clock" size={13} />{i18n.t('downloads.processedLabel')}</dt>
              <dd>{formatProcessingTime(item.processingMs)}</dd>
            </div>
          {/if}
          <div class="download-fact">
            <dt><Icon name="calendar" size={13} />{i18n.t('downloads.dateLabel')}</dt>
            <dd>{formatTimestamp(item.createdAt, i18n.locale)}</dd>
          </div>
        </dl>

        {#if modalHref}
          <a
            class="library-link"
            href={modalHref}
            aria-label={`${i18n.t('downloads.openInLibrary')} · ${
              item.movieTitle ?? item.filename
            }`}
          >
            <Icon name="film" size={13} />
            {i18n.t('downloads.openInLibrary')}
          </a>
        {/if}

        <DownloadConfigBadge config={item.config} movieId={item.movieId} downloadKey={item.key} />

        <div class="download-card-actions">
          <a class="download-primary hover-shine" href={item.downloadUrl} download>
            <Icon name="download" size={15} />
            {i18n.t('downloads.download')}
          </a>
          <button
            type="button"
            class="danger icon-btn hover-shine"
            disabled={deleting !== null}
            onclick={() => (pendingDelete = item)}
            aria-label={i18n.t('downloads.delete')}
            title={i18n.t('downloads.delete')}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </article>
    {/each}
  </div>
  {#if hasMore}
    <div
      class="load-more"
      use:infiniteScroll={{
        enabled: hasMore && !loadingMore,
        load: () => void loadStored(true),
      }}
    >
      <button
        type="button"
        class="ghost hover-shine"
        disabled={loadingMore}
        onclick={() => void loadStored(true)}
      >
        {loadingMore ? i18n.t('common.loadingMore') : i18n.t('common.loadMore')}
      </button>
    </div>
  {/if}
{/if}

<ConfirmDialog
  open={pendingDelete !== null}
  title={i18n.t('downloads.deleteTitle')}
  message={i18n.t('downloads.deleteMessage', { filename: pendingDelete?.filename ?? '' })}
  confirmLabel={i18n.t('downloads.delete')}
  busy={deleting !== null}
  onconfirm={confirmDelete}
  oncancel={() => (pendingDelete = null)}
/>

<style>
  .queue-section {
    margin-bottom: 1.25rem;
  }

  .downloads-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .load-more {
    display: flex;
    justify-content: center;
    margin-top: 1rem;
  }

  .download-card {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.05rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    transition:
      transform 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease;
  }

  .download-card:hover,
  .download-card:focus-within {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
    box-shadow:
      0 16px 32px -20px color-mix(in srgb, var(--accent) 40%, transparent),
      var(--shadow);
  }

  /* The hover transform creates a stacking context; lift the card so the open
     configuration panel stays above the page footer and sibling cards. */
  .download-card:has(:global(.config-panel):not([hidden])) {
    position: relative;
    z-index: 5;
  }

  .download-titles {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .download-card h3 {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    font-size: 0.98rem;
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .download-title {
    color: inherit;
  }

  .download-title:hover {
    color: var(--accent);
  }

  .download-subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .download-year {
    white-space: nowrap;
  }

  .download-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
    gap: 0.4rem;
    margin: 0;
    padding: 0.55rem 0.6rem;
    border: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--surface-2) 65%, transparent);
  }

  .download-fact {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .download-fact dt {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--muted);
    font-size: 0.7rem;
    font-weight: 650;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .download-fact dt :global(.icon) {
    color: var(--accent);
  }

  .download-fact dd {
    margin: 0;
    color: var(--text);
    font-size: 0.84rem;
    font-weight: 600;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .library-link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 0.3rem;
    color: var(--muted);
    font-size: 0.77rem;
    font-weight: 600;
  }

  .library-link:hover {
    color: var(--accent);
  }

  .download-card-actions {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.5rem;
    margin-top: auto;
    padding-top: 0.8rem;
    border-top: 1px solid var(--line);
  }

  .download-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.55rem 0.9rem;
    border-radius: 10px;
    background: var(--accent);
    color: var(--bg);
    font-size: 0.83rem;
    font-weight: 700;
    text-decoration: none;
    transition: filter 140ms ease;
  }

  .download-primary:hover {
    filter: brightness(1.06);
    text-decoration: none;
  }

  .download-card-actions .icon-btn {
    width: 2.4rem;
    height: 2.4rem;
    background: var(--danger-soft);
    border-color: transparent;
  }

  @media (max-width: 420px) {
    .download-facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
