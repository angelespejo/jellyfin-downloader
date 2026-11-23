<script lang="ts">
  import type { DownloadJobStatus } from '#lib/types.js'
  import { formatBytes, formatProcessingTime } from '#lib/format.js'
  import { getI18n } from '#core/i18n.svelte.js'
  import Icon from '#lib/components/icon.svelte'

  let {
    job,
    error = null,
    oncancel,
    cancelling = false,
  }: {
    job: DownloadJobStatus | null
    error?: string | null
    oncancel?: () => void
    cancelling?: boolean
  } = $props()

  const i18n = getI18n()
  const percent = $derived(
    job?.progress === null || job?.progress === undefined ? null : Math.round(job.progress * 100)
  )
  const jobError = $derived(
    job ? i18n.error(job.errorCode, job.error ?? i18n.t('job.error')) : null
  )
</script>

{#if error}
  <div class="error-box" role="alert">{error}</div>
{/if}

{#if job}
  <div class="section" aria-live="polite">
    <div class="job-head">
      <strong>
        {#if job.state === 'ready'}
          {i18n.t('job.ready')}
        {:else if job.state === 'failed'}
          {i18n.t('job.failed')}
        {:else if job.state === 'cancelled'}
          {i18n.t('job.cancelled')}
        {:else}
          {i18n.stage(job.stage)}
        {/if}
      </strong>
      <span class="job-head-actions">
        {#if job.cached}
          <span class="badge good">{i18n.t('job.cached')}</span>
        {:else if job.stored}
          <span class="badge accent">{i18n.t('job.stored')}</span>
        {/if}
        {#if oncancel && (job.state === 'queued' || job.state === 'running')}
          <button
            type="button"
            class="danger job-cancel hover-shine"
            disabled={cancelling}
            onclick={oncancel}
          >
            <Icon name="close" size={13} />
            {i18n.t('queue.cancel')}
          </button>
        {/if}
      </span>
    </div>

    {#if job.state === 'queued'}
      <p class="muted small">
        {i18n.t('job.position', { position: job.queuePosition ?? '—' })}
      </p>
    {:else if job.state === 'running'}
      <div class="progress" aria-label={i18n.t('job.progress')}>
        <span style={`width: ${percent ?? 12}%`}></span>
      </div>
      <div class="job-meta">
        <span>{i18n.stage(job.stage)}</span>
        <span>{percent === null ? i18n.t('common.loading') : `${percent}%`}</span>
      </div>
    {:else if job.state === 'ready' && job.output}
      <div class="note good">
        {job.output.kind === 'zip' ? i18n.t('job.zip') : i18n.t('job.file')} ·
        {job.output.filename} · {formatBytes(job.output.sizeBytes, i18n.locale)}
      </div>
      {#if job.processingMs > 0}
        <p class="muted small" title={i18n.t('common.processedHint')}>
          {i18n.t('common.processedIn', { time: formatProcessingTime(job.processingMs) })}
        </p>
      {/if}
      <div class="actions">
        <a class="badge accent hover-shine" href={job.output.downloadUrl} download>
          {i18n.t('job.download')}
        </a>
        {#if job.expectedFiles > 1}
          <span class="muted small">
            {i18n.t('job.includes', { count: job.expectedFiles })}
          </span>
        {/if}
      </div>
    {:else if jobError}
      <div class="note bad">{jobError}</div>
    {/if}
  </div>
{/if}

<style>
  .job-head-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .job-cancel {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.55rem;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 600;
  }
</style>
