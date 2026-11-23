<script lang="ts">
  import Icon from '#lib/components/icon.svelte'
  import { getI18n } from '#core/i18n.svelte.js'
  import type { DownloadJobStatus } from '#lib/types.js'

  let {
    items,
    oncancel,
  }: {
    items: { movieId: string; title: string; job: DownloadJobStatus }[]
    oncancel?: (item: { movieId: string; title: string; job: DownloadJobStatus }) => void
  } = $props()

  const i18n = getI18n()

  function stateLabel(job: DownloadJobStatus): string {
    if (job.state === 'queued') return i18n.t('batch.queued')
    if (job.state === 'running') return i18n.t('batch.processing')
    if (job.state === 'ready') return i18n.t('batch.ready')
    if (job.state === 'failed') return i18n.t('batch.failed')
    return i18n.t('job.cancelled')
  }

  function stateTone(job: DownloadJobStatus): string {
    if (job.state === 'ready') return 'good'
    if (job.state === 'failed') return 'bad'
    if (job.state === 'cancelled') return 'warn'
    if (job.state === 'running') return 'accent'
    return ''
  }

  function percent(job: DownloadJobStatus): number | null {
    if (job.progress === null || job.progress === undefined) return null
    return Math.round(job.progress * 100)
  }
</script>

{#if items.length === 0}
  <p class="muted small">{i18n.t('batch.noJobs')}</p>
{:else}
  <ul class="batch-list" aria-label={i18n.t('batch.title')}>
    {#each items as item (item.job.id)}
      {@const progress = percent(item.job)}
      <li class="batch-item">
        <div class="batch-head">
          <span class="batch-title" title={item.title}>{item.title}</span>
          <span class={['badge', stateTone(item.job)]}>{stateLabel(item.job)}</span>
        </div>

        {#if item.job.state === 'running'}
          <div
            class="progress"
            role="progressbar"
            aria-label={`${i18n.t('batch.processing')} · ${item.title}`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progress ?? undefined}
            aria-valuetext={progress === null ? i18n.t('common.loading') : `${progress}%`}
          >
            <span style={`width: ${progress ?? 12}%`}></span>
          </div>
        {/if}

        {#if item.job.output?.downloadUrl}
          <a
            class="badge accent batch-download hover-shine"
            href={item.job.output.downloadUrl}
            download
          >
            <Icon name="download" size={13} />
            {i18n.t('batch.download')}
          </a>
        {/if}

        {#if oncancel && (item.job.state === 'queued' || item.job.state === 'running')}
          <button
            type="button"
            class="danger batch-cancel hover-shine"
            onclick={() => oncancel?.(item)}
          >
            <Icon name="close" size={13} />
            {i18n.t('queue.cancel')}
          </button>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .batch-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .batch-item {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }

  .batch-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    min-width: 0;
  }

  .batch-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.86rem;
    font-weight: 600;
  }

  .batch-download {
    align-self: flex-start;
    font-size: 0.72rem;
  }

  .batch-cancel {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.55rem;
    border-radius: 8px;
    font-size: 0.72rem;
    font-weight: 600;
  }
</style>
