<script lang="ts">
  import { untrack } from 'svelte'
  import type { DownloadJobStatus } from '#lib/types.js'
  import { formatBytes } from '#lib/format.js'
  import { getI18n } from '#core/i18n.svelte.js'
  import { getNotifications } from '#core/notifications.svelte.js'
  import { getDownloadQueue } from '#core/download-queue.svelte.js'
  import ConfirmDialog from '#lib/components/confirm-dialog.svelte'
  import Icon from '#lib/components/icon.svelte'
  import DownloadConfigBadge from '#lib/ui/download-config-badge.svelte'

  let { compact = false, hideEmpty = false }: { compact?: boolean; hideEmpty?: boolean } = $props()

  const i18n = getI18n()
  const notifications = getNotifications()
  const queue = getDownloadQueue()

  let pendingCancel = $state<DownloadJobStatus | null>(null)
  let cancelling = $state<string | null>(null)

  $effect(() => {
    untrack(() => queue.start())
    return () => queue.stop()
  })

  function percent(job: DownloadJobStatus): number | null {
    if (job.progress === null || job.progress === undefined) return null
    return Math.round(job.progress * 100)
  }

  async function confirmCancel(): Promise<void> {
    const job = pendingCancel
    if (!job) return
    cancelling = job.id
    const result = await queue.cancelJob(job.id)
    cancelling = null
    pendingCancel = null
    if (!result.ok) {
      notifications.notify({
        level: 'error',
        message: i18n.error(result.code, i18n.t('queue.cancelError')),
      })
      return
    }
    notifications.notify({
      level: 'success',
      message: i18n.t('queue.cancelled', { name: job.title }),
    })
  }
</script>

{#if queue.error}
  <div class="error-box" role="alert">{i18n.t('queue.error')}</div>
{/if}

{#if queue.jobs.length === 0}
  {#if !hideEmpty}
    <p class="muted small">{i18n.t('queue.empty')}</p>
  {/if}
{:else}
  <ul class="queue-list" aria-label={i18n.t('queue.title')}>
    {#each queue.jobs as job (job.id)}
      {@const value = percent(job)}
      <li class="queue-item">
        <div class="queue-head">
          <div class="queue-titles">
            <span class="queue-title" title={job.title}>{job.title}</span>
            <span class="muted small queue-file" title={job.filename}>{job.filename}</span>
          </div>
          <span class="badge accent">
            {#if job.state === 'running'}
              {i18n.stage(job.stage)}
            {:else}
              {i18n.t('job.queued')}
            {/if}
          </span>
        </div>

        {#if job.state === 'running'}
          <div
            class="progress"
            role="progressbar"
            aria-label={`${i18n.t('job.progress')} · ${job.title}`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={value ?? undefined}
            aria-valuetext={value === null ? i18n.t('common.loading') : `${value}%`}
          >
            <span style={`width: ${value ?? 12}%`}></span>
          </div>
          <div class="queue-meta">
            <span>{i18n.stage(job.stage)}</span>
            <span>{value === null ? i18n.t('common.loading') : `${value}%`}</span>
          </div>
        {:else}
          <p class="muted small">
            {i18n.t('job.position', { position: job.queuePosition ?? '—' })}
          </p>
        {/if}

        {#if job.sourceSizeBytes || !compact}
          <div class="queue-meta">
            {#if job.sourceSizeBytes}
              <span title={i18n.t('common.originalSizeHint')}>
                {i18n.t('common.originalSize', {
                  size: formatBytes(job.sourceSizeBytes, i18n.locale),
                })}
              </span>
            {/if}
            {#if !compact}
              <span>{job.expectedFiles > 1 ? i18n.t('job.zip') : i18n.t('job.file')}</span>
            {/if}
          </div>
        {/if}

        <DownloadConfigBadge config={job.config} movieId={job.movieId} downloadKey={null} compact />

        <div class="queue-actions">
          <button
            type="button"
            class="danger hover-shine"
            disabled={cancelling !== null}
            onclick={() => (pendingCancel = job)}
          >
            <Icon name="close" size={14} />
            {i18n.t('queue.cancel')}
          </button>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<ConfirmDialog
  open={pendingCancel !== null}
  title={i18n.t('queue.cancelTitle')}
  message={i18n.t('queue.cancelMessage', { name: pendingCancel?.title ?? '' })}
  confirmLabel={i18n.t('queue.cancel')}
  busy={cancelling !== null}
  onconfirm={() => void confirmCancel()}
  oncancel={() => (pendingCancel = null)}
/>

<style>
  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .queue-item {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
  }

  .queue-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .queue-titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .queue-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 650;
  }

  .queue-file {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .queue-meta {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--muted);
    font-size: 0.78rem;
  }

  .queue-actions {
    display: flex;
    justify-content: flex-end;
  }

  .queue-actions button {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.6rem;
    border-radius: 8px;
    font-size: 0.78rem;
    font-weight: 600;
  }
</style>
