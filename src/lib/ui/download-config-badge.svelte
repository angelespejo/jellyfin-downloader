<script lang="ts">
  import Icon from '#lib/components/icon.svelte'
  import { getI18n } from '#core/i18n.svelte.js'
  import type { DownloadConfig, TrackSelection } from '#lib/types.js'

  let {
    config,
    movieId,
    downloadKey,
    compact = false,
  }: {
    config: DownloadConfig | null
    movieId: string | null
    downloadKey: string | null
    compact?: boolean
  } = $props()

  const i18n = getI18n()
  const panelId = $props.id()

  let root = $state<HTMLDivElement | null>(null)
  let trigger = $state<HTMLButtonElement | null>(null)
  let pinned = $state(false)
  let hovering = $state(false)
  let focusWithin = $state(false)

  const open = $derived(pinned || hovering || focusWithin)
  const presetLabel = $derived(config ? (config.presetName ?? i18n.t('config.badgeCustom')) : null)
  const label = $derived(
    presetLabel ? `${i18n.t('config.badgeLabel')}` : i18n.t('config.badgeLabel')
  )
  const replicateHref = $derived(
    movieId && downloadKey
      ? `/?modal=${encodeURIComponent(movieId)}&from=${encodeURIComponent(downloadKey)}`
      : null
  )

  function attachRoot(node: HTMLDivElement): () => void {
    root = node
    return () => {
      if (root === node) root = null
    }
  }

  function attachTrigger(node: HTMLButtonElement): () => void {
    trigger = node
    return () => {
      if (trigger === node) trigger = null
    }
  }

  function close(): void {
    pinned = false
    hovering = false
    focusWithin = false
  }

  function toggle(): void {
    if (open) close()
    else pinned = true
  }

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null
    if (next && root?.contains(next)) return
    focusWithin = false
    pinned = false
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    event.stopPropagation()
    close()
    trigger?.focus()
  }

  function containerLabel(value: string | undefined): string {
    if (!value || value === 'source') return i18n.t('config.source')
    return value.toUpperCase()
  }

  function qualityLabel(value: string | undefined): string {
    if (!value || value === 'original') return i18n.t('options.original')
    return value
  }

  function videoLabel(value: string | undefined): string {
    if (!value) return i18n.t('config.unknown')
    return value === 'copy' ? i18n.t('options.copyVideo') : value.toUpperCase()
  }

  function audioLabel(value: string | undefined): string {
    if (!value) return i18n.t('config.unknown')
    return value === 'copy' ? i18n.t('options.copyAudio') : value.toUpperCase()
  }

  function audioPackagingLabel(value: string | undefined): string {
    return value === 'separate' ? i18n.t('options.separate') : i18n.t('options.integrated')
  }

  function subtitleLabel(value: string | undefined): string {
    if (value === 'muxed') return i18n.t('subtitles.allMuxed')
    if (value === 'separate') return i18n.t('subtitles.allSeparate')
    if (value === 'burn') return i18n.t('subtitles.burnOne')
    if (value === 'none') return i18n.t('subtitles.none')
    return i18n.t('subtitles.mirror')
  }

  function trackCount(
    indices: number[] | undefined,
    selection: TrackSelection | undefined
  ): string {
    if (indices) return String(indices.length)
    if (!selection || selection === 'all') return i18n.t('settings.selectionAll')
    if (selection === 'default') return i18n.t('settings.selectionDefault')
    if (selection === 'none') return i18n.t('settings.selectionNone')
    return String(selection.languages.length)
  }
</script>

<div class={['config-badge', { compact }]} {@attach attachRoot}>
  <button
    {@attach attachTrigger}
    type="button"
    class="config-trigger hover-shine"
    aria-expanded={open}
    aria-controls={panelId}
    aria-label={open ? i18n.t('config.hide') : i18n.t('config.show')}
    title={i18n.t('config.title')}
    onmouseenter={() => (hovering = true)}
    onmouseleave={() => (hovering = false)}
    onfocusin={() => (focusWithin = true)}
    onfocusout={onFocusOut}
    onkeydown={onKeydown}
    onclick={toggle}
  >
    <Icon name="info" size={compact ? 12 : 14} />
    <span class="config-label">{label}</span>
  </button>

  <div
    id={panelId}
    class="config-panel"
    role="dialog"
    aria-label={i18n.t('config.title')}
    tabindex="-1"
    hidden={!open}
    onmouseenter={() => (hovering = true)}
    onmouseleave={() => (hovering = false)}
    onfocusin={() => (focusWithin = true)}
    onfocusout={onFocusOut}
    onkeydown={onKeydown}
  >
    {#if config}
      <p class="config-heading">{i18n.t('config.badgeLabel')}</p>
      <dl class="config-rows">
        <div class="config-row">
          <dt>{i18n.t('config.preset')}</dt>
          <dd>{config.presetName ?? i18n.t('config.custom')}</dd>
        </div>
        <div class="config-row">
          <dt>{i18n.t('config.container')}</dt>
          <dd>{containerLabel(config.options.container)}</dd>
        </div>
        <div class="config-row">
          <dt>{i18n.t('config.quality')}</dt>
          <dd>{qualityLabel(config.options.quality)}</dd>
        </div>
        <div class="config-row">
          <dt>{i18n.t('config.video')}</dt>
          <dd>{videoLabel(config.options.videoCodec)}</dd>
        </div>
        <div class="config-row">
          <dt>{i18n.t('config.audio')}</dt>
          <dd>{audioLabel(config.options.audioCodec)}</dd>
        </div>
        <div class="config-row">
          <dt>{i18n.t('config.audioPackaging')}</dt>
          <dd>{audioPackagingLabel(config.options.audioPackaging)}</dd>
        </div>
        <div class="config-row">
          <dt>{i18n.t('config.subtitles')}</dt>
          <dd>{subtitleLabel(config.options.subtitleStrategy)}</dd>
        </div>
        <div class="config-row">
          <dt>{i18n.t('config.hardware')}</dt>
          <dd>
            {config.options.hardwareAcceleration !== false
              ? i18n.t('config.hardwareOn')
              : i18n.t('config.hardwareOff')}
          </dd>
        </div>
        <div class="config-row">
          <dt>{i18n.t('config.audioTracks')}</dt>
          <dd>{trackCount(config.options.audioStreamIndices, config.options.audioSelection)}</dd>
        </div>
        <div class="config-row">
          <dt>{i18n.t('config.subtitleTracks')}</dt>
          <dd>
            {trackCount(config.options.subtitleStreamIndices, config.options.subtitleSelection)}
          </dd>
        </div>
      </dl>

      {#if replicateHref}
        <a class="config-replicate" href={replicateHref} title={i18n.t('config.replicateHint')}>
          <Icon name="download" size={13} />
          {i18n.t('config.replicate')}
        </a>
        <p class="config-hint">{i18n.t('config.replicateHint')}</p>
      {/if}
    {:else}
      <p class="config-unavailable">{i18n.t('config.unavailable')}</p>
    {/if}
  </div>
</div>

<style>
  .config-badge {
    position: relative;
    display: inline-flex;
    align-self: flex-start;
    max-width: 100%;
  }

  .config-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    max-width: 100%;
    padding: 0.2rem 0.55rem;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 650;
    line-height: 1.3;
  }

  .config-trigger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent-soft) 65%, var(--surface-2));
    border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
  }

  .compact .config-trigger {
    padding: 0.1rem 0.4rem;
    font-size: 0.66rem;
  }

  .config-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .config-panel {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 30;
    width: min(280px, 78vw);
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--text);
  }

  .config-panel[hidden] {
    display: none;
  }

  .config-heading {
    margin: 0 0 0.4rem;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .config-rows {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin: 0;
  }

  .config-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.7rem;
    font-size: 0.74rem;
  }

  .config-row dt {
    color: var(--muted);
    font-weight: 600;
  }

  .config-row dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }

  .config-replicate {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.65rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--line);
    font-size: 0.76rem;
    font-weight: 650;
  }

  .config-hint,
  .config-unavailable {
    margin: 0.2rem 0 0;
    color: var(--muted);
    font-size: 0.68rem;
    line-height: 1.35;
  }

  .config-unavailable {
    font-size: 0.74rem;
  }
</style>
