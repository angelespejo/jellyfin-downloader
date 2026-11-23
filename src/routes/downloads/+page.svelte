<script lang="ts">
  import type { PageData } from './$types'
  import type { LocalDownloadInfo } from '#lib/types.js'
  import { formatBytes, formatTimestamp } from '#lib/format.js'
  import { getI18n } from '#core/i18n.svelte.js'
  import { getNotifications } from '#core/notifications.svelte.js'
  import Icon from '#lib/components/icon.svelte'
  import EmptyState from '#lib/components/empty-state.svelte'
  import ConfirmDialog from '#lib/components/confirm-dialog.svelte'
  import DownloadConfigBadge from '#lib/ui/download-config-badge.svelte'
  import DownloadQueue from '#lib/ui/download-queue.svelte'
  import { getDownloadQueue } from '#core/download-queue.svelte.js'

  let { data }: { data: PageData } = $props()
  const i18n = getI18n()
  const notifications = getNotifications()
  const queue = getDownloadQueue()

  // svelte-ignore state_referenced_locally
  let items = $state<LocalDownloadInfo[]>(data.items)
  // svelte-ignore state_referenced_locally
  let storage = $state(data.storage)
  let error = $state<string | null>(null)
  let deleting = $state<string | null>(null)
  let pendingDelete = $state<LocalDownloadInfo | null>(null)
  let previousActive = 0

  async function refreshStored(): Promise<void> {
    try {
      const response = await fetch('/api/v1/local-downloads')
      if (!response.ok) return
      const payload = (await response.json()) as { enabled: boolean; items: LocalDownloadInfo[] }
      items = payload.items ?? []
      storage = {
        enabled: payload.enabled,
        usedBytes: items.reduce((total, item) => total + item.sizeBytes, 0),
        objects: items.length,
      }
    } catch {
      // keep the current list when the refresh fails
    }
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
    <span class="muted small">{i18n.t('downloads.count', { count: items.length })}</span>
  </div>
  <div class="downloads-grid">
    {#each items as item (item.key)}
      {@const modalId = item.movieId}
      {@const modalHref = modalId ? `/?modal=${encodeURIComponent(modalId)}` : null}
      <article class="download-card">
        <div class="download-card-head">
          <div>
            <h3>
              {#if modalHref}
                <a
                  class="download-title"
                  href={modalHref}
                  title={i18n.t('downloads.openInLibrary')}
                >
                  {item.filename}
                </a>
              {:else}
                {item.filename}
              {/if}
            </h3>
            <p class="muted small">
              {item.movieTitle ?? i18n.t('downloads.unknownMovie')}
              {#if item.movieYear}
                · {item.movieYear}{/if}
            </p>
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
          </div>
          <span class="badge info">
            <Icon name="download" size={13} />
            {item.kind === 'zip' ? i18n.t('downloads.zip') : i18n.t('downloads.file')}
          </span>
        </div>
        <div class="download-meta">
          <span>
            {i18n.t('downloads.size', { size: formatBytes(item.sizeBytes, i18n.locale) })}
          </span>
          {#if item.sourceSizeBytes}
            <span title={i18n.t('common.originalSizeHint')}>
              {i18n.t('common.originalSize', {
                size: formatBytes(item.sourceSizeBytes, i18n.locale),
              })}
            </span>
          {/if}
          <span>
            {i18n.t('downloads.date', { date: formatTimestamp(item.createdAt, i18n.locale) })}
          </span>
        </div>
        <DownloadConfigBadge config={item.config} movieId={item.movieId} downloadKey={item.key} />
        <div class="download-actions">
          <a class="badge accent-high hover-shine" href={item.downloadUrl} download>
            <Icon name="download" size={14} />
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

  .download-title {
    color: inherit;
  }

  .download-title:hover {
    color: var(--accent);
  }

  .library-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.35rem;
    font-size: 0.78rem;
    font-weight: 600;
  }
</style>
