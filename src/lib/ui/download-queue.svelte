<script lang="ts">
  import { untrack } from 'svelte'
  import type { DownloadJobStatus } from '#lib/types.js'
  import { formatBytes, formatProcessingTime } from '#lib/format.js'
  import { getI18n } from '#core/i18n.svelte.js'
  import { getNotifications } from '#core/notifications.svelte.js'
  import { getDownloadQueue } from '#core/download-queue.svelte.js'
  import ConfirmDialog from '#lib/components/confirm-dialog.svelte'
  import Icon from '#lib/components/icon.svelte'
  import DownloadConfigBadge from '#lib/ui/download-config-badge.svelte'

  let {
    compact = false,
    hideEmpty = false,
    jobs = null,
    onopen,
  }: {
    compact?: boolean
    hideEmpty?: boolean
    jobs?: DownloadJobStatus[] | null
    onopen?: (job: DownloadJobStatus) => void
  } = $props()

  const i18n = getI18n()
  const notifications = getNotifications()
  const queue = getDownloadQueue()
  const visibleJobs = $derived(jobs ?? queue.jobs)

  let pendingCancel = $state<DownloadJobStatus | null>(null)
  let pendingRestart = $state<DownloadJobStatus | null>(null)
  let cancelling = $state<string | null>(null)
  let acting = $state<string | null>(null)

  $effect(() => {
    untrack(() => queue.start())
    return () => queue.stop()
  })

  function percent(job: DownloadJobStatus): number | null {
    if (job.progress === null || job.progress === undefined) return null
    return Math.round(job.progress * 100)
  }

  async function act(job: DownloadJobStatus, action: 'pause' | 'resume'): Promise<void> {
    acting = job.id
    const result = await queue.act(job.id, action)
    acting = null
    if (!result.ok) {
      notifications.notify({
        level: 'error',
        message: i18n.error(
          result.code,
          i18n.t(action === 'pause' ? 'queue.pauseError' : 'queue.resumeError')
        ),
      })
      return
    }
    notifications.notify({
      level: 'success',
      message: i18n.t(action === 'pause' ? 'queue.paused' : 'queue.resumed', { name: job.title }),
    })
  }

  async function confirmRestart(): Promise<void> {
    const job = pendingRestart
    if (!job) return
    acting = job.id
    const result = await queue.restartJob(job.id)
    acting = null
    pendingRestart = null
    if (!result.ok) {
      notifications.notify({
        level: 'error',
        message: i18n.error(result.code, i18n.t('queue.restartError')),
      })
      return
    }
    notifications.notify({
      level: 'success',
      message: i18n.t('queue.restarted', { name: job.title }),
    })
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

{#if visibleJobs.length === 0}
  {#if !hideEmpty}
    <p class="muted small">{i18n.t('queue.empty')}</p>
  {/if}
{:else}
  <ul class="queue-list" aria-label={i18n.t('queue.title')}>
    {#each visibleJobs as job (job.id)}
      {@const value = percent(job)}
      {@const elapsed = queue.elapsedMs(job)}
      <li class="queue-item">
        <div class="queue-head">
          <div class="queue-titles">
            {#if onopen}
              <button
                type="button"
                class="queue-title queue-title-action"
                title={i18n.t('queue.openItem', { name: job.title })}
                onclick={() => onopen?.(job)}
              >
                {job.title}
              </button>
            {:else}
              <a
                class="queue-title queue-title-action"
                href={`/?modal=${encodeURIComponent(job.movieId)}`}
                title={i18n.t('queue.openItem', { name: job.title })}
              >
                {job.title}
              </a>
            {/if}
            <span class="muted small queue-file" title={job.filename}>{job.filename}</span>
          </div>
          <span class="badge accent">
            {#if job.state === 'running'}
              {i18n.stage(job.stage)}
            {:else if job.state === 'paused'}
              {i18n.t('job.paused')}
            {:else}
              {i18n.t('job.queued')}
            {/if}
          </span>
        </div>

        {#if job.state === 'running' || job.state === 'paused'}
          <div
            class="progress"
            role="progressbar"
            aria-label={`${i18n.t(job.state === 'paused' ? 'job.paused' : 'job.progress')} · ${job.title}`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={value ?? undefined}
            aria-valuetext={value === null ? i18n.t('common.loading') : `${value}%`}
          >
            <span style={`width: ${value ?? 12}%`}></span>
          </div>
          <div class="queue-meta">
            <span>
              {#if job.state === 'paused'}
                {i18n.t('job.paused')}
              {:else}
                {i18n.stage(job.stage)}
              {/if}
              {#if elapsed > 0}
                <span class="queue-elapsed">
                  <Icon name="clock" size={12} />
                  {formatProcessingTime(elapsed)}
                </span>
              {/if}
            </span>
            <span>{value === null ? i18n.t('common.loading') : `${value}%`}</span>
          </div>
        {:else}
          <p class="muted small">
            {i18n.t('job.position', { position: job.queuePosition ?? '—' })}
          </p>
        {/if}

        {#if job.sourceSizeBytes || !compact}
          <div class="queue-facts">
            {#if job.sourceSizeBytes}
              <span class="queue-fact" title={i18n.t('common.originalSizeHint')}>
                <Icon name="film" size={13} />
                {i18n.t('common.originalSize', {
                  size: formatBytes(job.sourceSizeBytes, i18n.locale),
                })}
              </span>
            {/if}
            {#if !compact}
              <span class="queue-fact">
                <Icon name={job.expectedFiles > 1 ? 'archive' : 'file'} size={13} />
                {job.expectedFiles > 1 ? i18n.t('job.zip') : i18n.t('job.file')}
              </span>
            {/if}
          </div>
        {/if}

        <DownloadConfigBadge config={job.config} movieId={job.movieId} downloadKey={null} compact />

        <div class="queue-actions">
          {#if job.state === 'queued' || job.state === 'running'}
            <button
              type="button"
              class="action-neutral hover-shine"
              disabled={acting !== null || cancelling !== null}
              onclick={() => void act(job, 'pause')}
            >
              <Icon name="pause" size={14} />
              {i18n.t('queue.pause')}
            </button>
          {:else if job.state === 'paused'}
            <button
              type="button"
              class="action-neutral hover-shine"
              disabled={acting !== null || cancelling !== null}
              onclick={() => void act(job, 'resume')}
            >
              <Icon name="play" size={14} />
              {i18n.t('queue.resume')}
            </button>
            <button
              type="button"
              class="action-neutral hover-shine"
              disabled={acting !== null || cancelling !== null}
              onclick={() => (pendingRestart = job)}
            >
              <Icon name="restart" size={14} />
              {i18n.t('queue.restart')}
            </button>
          {/if}
          <button
            type="button"
            class="action-danger hover-shine"
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

<ConfirmDialog
  open={pendingRestart !== null}
  title={i18n.t('queue.restartTitle')}
  message={i18n.t('queue.restartMessage', { name: pendingRestart?.title ?? '' })}
  confirmLabel={i18n.t('queue.restart')}
  busy={acting !== null}
  onconfirm={() => void confirmRestart()}
  oncancel={() => (pendingRestart = null)}
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
    gap: 0.5rem;
    padding: 0.8rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    transition: border-color 160ms ease;
  }

  .queue-item:hover,
  .queue-item:focus-within {
    border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  }

  .queue-item:has(:global(.config-panel):not([hidden])) {
    position: relative;
    z-index: 5;
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
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.3;
  }

  .queue-title-action {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 700;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .queue-title-action:hover,
  .queue-title-action:focus-visible {
    color: var(--accent);
    text-decoration: underline;
  }

  .queue-file {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.78rem;
  }

  .queue-meta {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--muted);
    font-size: 0.78rem;
  }

  .queue-elapsed {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    margin-left: 0.3rem;
    color: var(--text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .queue-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .queue-fact {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.18rem 0.5rem;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
  }

  .queue-fact :global(.icon) {
    color: var(--accent);
  }

  .progress {
    height: 10px;
  }

  .queue-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .queue-actions button {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.38rem 0.65rem;
    border-radius: 8px;
    font-size: 0.78rem;
    font-weight: 650;
  }

  .queue-actions .action-neutral {
    border-color: var(--line);
    background: var(--surface-2);
    color: var(--text);
  }

  .queue-actions .action-neutral:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
    color: var(--accent);
  }

  .queue-actions .action-danger {
    border-color: transparent;
    background: var(--danger-soft);
    color: var(--danger);
  }

  .queue-actions .action-danger:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--danger) 35%, transparent);
    background: color-mix(in srgb, var(--danger-soft) 80%, var(--surface-2));
  }
</style>
