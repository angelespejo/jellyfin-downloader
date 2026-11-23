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
    onpause,
    onresume,
    onrestart,
    acting = false,
  }: {
    job: DownloadJobStatus | null
    error?: string | null
    oncancel?: () => void
    cancelling?: boolean
    onpause?: () => void
    onresume?: () => void
    onrestart?: () => void
    acting?: boolean
  } = $props()

  const i18n = getI18n()
  const percent = $derived(
    job?.progress === null || job?.progress === undefined ? null : Math.round(job.progress * 100)
  )
  const jobError = $derived(
    job ? i18n.error(job.errorCode, job.error ?? i18n.t('job.error')) : null
  )

  let now = $state(Date.now())
  let anchor = $state({ id: '', ms: 0, at: 0 })

  // Re-anchor whenever the server sends a fresh processing time (or the job changes).
  $effect(() => {
    const id = job?.id ?? ''
    const ms = job?.processingMs ?? 0
    const at = Date.now()
    anchor = { id, ms, at }
    now = at
  })

  // Tick locally so the elapsed time moves between polls.
  $effect(() => {
    if (job?.state !== 'running') return
    const id = setInterval(() => (now = Date.now()), 1000)
    return () => clearInterval(id)
  })

  const elapsed = $derived.by(() => {
    if (!job) return 0
    if (job.state !== 'running') return job.processingMs
    const base = anchor.id === job.id ? anchor.ms : job.processingMs
    return Math.max(0, base + (now - anchor.at))
  })
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
        {:else if job.state === 'paused'}
          {i18n.t('job.paused')}
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
        {#if onpause && (job.state === 'queued' || job.state === 'running')}
          <button
            type="button"
            class="ghost job-action hover-shine"
            disabled={cancelling || acting}
            onclick={onpause}
          >
            <Icon name="pause" size={13} />
            {i18n.t('queue.pause')}
          </button>
        {/if}
        {#if onresume && job.state === 'paused'}
          <button
            type="button"
            class="ghost job-action hover-shine"
            disabled={cancelling || acting}
            onclick={onresume}
          >
            <Icon name="play" size={13} />
            {i18n.t('queue.resume')}
          </button>
        {/if}
        {#if onrestart && (job.state === 'paused' || job.state === 'failed' || job.state === 'cancelled')}
          <button
            type="button"
            class="ghost job-action hover-shine"
            disabled={cancelling || acting}
            onclick={onrestart}
          >
            <Icon name="restart" size={13} />
            {i18n.t('queue.restart')}
          </button>
        {/if}
        {#if oncancel && (job.state === 'queued' || job.state === 'running' || job.state === 'paused')}
          <button
            type="button"
            class="danger job-cancel hover-shine"
            disabled={cancelling || acting}
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
    {:else if job.state === 'running' || job.state === 'paused'}
      <div
        class="progress"
        aria-label={i18n.t(job.state === 'paused' ? 'job.paused' : 'job.progress')}
      >
        <span style={`width: ${percent ?? 12}%`}></span>
      </div>
      <div class="job-meta">
        <span>
          {#if job.state === 'paused'}
            {i18n.t('job.paused')}
          {:else}
            {i18n.stage(job.stage)}
          {/if}
          {#if elapsed > 0}
            <span class="job-elapsed">
              <Icon name="clock" size={12} />
              {formatProcessingTime(elapsed)}
            </span>
          {/if}
        </span>
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

  .job-action {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.55rem;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .job-elapsed {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    margin-left: 0.3rem;
    color: var(--text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
