<script lang="ts">
  import Field from '#lib/components/field.svelte'
  import { getI18n } from '#core/i18n.svelte.js'
  import type {
    AudioCodec,
    Capabilities,
    Container,
    DownloadOptionsInput,
    VideoCodec,
  } from '#lib/types.js'

  let {
    options = $bindable(),
    capabilities,
    defaultContainer = 'mkv',
    showSource = true,
    showHardware = false,
    sourceHeight = null,
    onchange,
    onqualitychange,
  }: {
    options: DownloadOptionsInput
    capabilities: Capabilities
    defaultContainer?: Container
    showSource?: boolean
    showHardware?: boolean
    sourceHeight?: number | null
    onchange?: () => void
    onqualitychange?: (quality: DownloadOptionsInput['quality']) => void
  } = $props()

  const i18n = getI18n()

  const effectiveContainer = $derived<Container>(
    options.container === 'source' ? defaultContainer : (options.container ?? 'mkv')
  )
  const videoCodecs = $derived<VideoCodec[]>(
    capabilities.videoCodecs[effectiveContainer] ?? ['copy']
  )
  const audioCodecs = $derived<AudioCodec[]>(
    capabilities.audioCodecs[effectiveContainer] ?? ['copy']
  )

  const targetHeight = $derived.by(() => {
    const quality = options.quality
    if (!quality || quality === 'original') return null
    const match = /^(\d+)p$/.exec(quality)
    return match ? Number(match[1]) : null
  })
  const upscaleWarning = $derived(
    targetHeight !== null &&
      typeof sourceHeight === 'number' &&
      sourceHeight > 0 &&
      targetHeight > sourceHeight
  )

  function containerLabel(value: string): string {
    return value === 'source'
      ? i18n.t('options.containerSource', { container: defaultContainer.toUpperCase() })
      : value.toUpperCase()
  }

  function qualityLabel(value: string): string {
    return value === 'original' ? i18n.t('options.original') : value
  }

  function strategyLabel(value: string): string {
    if (value === 'mirror-source') return i18n.t('subtitles.mirror')
    if (value === 'muxed') return i18n.t('subtitles.allMuxed')
    if (value === 'separate') return i18n.t('subtitles.allSeparate')
    if (value === 'burn') return i18n.t('subtitles.burnOne')
    return i18n.t('subtitles.none')
  }

  function changed(): void {
    onchange?.()
  }
</script>

<div class="grid-3">
  <Field
    label={i18n.t('options.container')}
    forId="output-container"
    description={i18n.t('settings.help.container')}
  >
    <select id="output-container" bind:value={options.container} onchange={changed}>
      {#if showSource}
        <option value="source">{containerLabel('source')}</option>
      {/if}
      {#each capabilities.containers as container (container)}
        <option value={container}>{containerLabel(container)}</option>
      {/each}
    </select>
  </Field>

  <Field
    label={i18n.t('options.quality')}
    forId="output-quality"
    description={i18n.t('settings.help.quality')}
  >
    <select
      id="output-quality"
      value={options.quality}
      onchange={(event) => {
        const value = (event.currentTarget as HTMLSelectElement)
          .value as DownloadOptionsInput['quality']
        options.quality = value
        onqualitychange?.(value)
        changed()
      }}
    >
      <option value="original">{qualityLabel('original')}</option>
      <option value="2160p">2160p</option>
      <option value="1440p">1440p</option>
      <option value="1080p">1080p</option>
      <option value="720p">720p</option>
      <option value="480p">480p</option>
      <option value="360p">360p</option>
    </select>
  </Field>

  <Field
    label={i18n.t('options.video')}
    forId="output-video-codec"
    description={i18n.t('settings.help.videoCodec')}
  >
    <select id="output-video-codec" bind:value={options.videoCodec} onchange={changed}>
      {#each videoCodecs as codec (codec)}
        <option value={codec}>
          {codec === 'copy' ? i18n.t('options.copyVideo') : codec.toUpperCase()}
        </option>
      {/each}
    </select>
  </Field>

  <Field
    label={i18n.t('options.audio')}
    forId="output-audio-codec"
    description={i18n.t('settings.help.audioCodec')}
  >
    <select id="output-audio-codec" bind:value={options.audioCodec} onchange={changed}>
      {#each audioCodecs as codec (codec)}
        <option value={codec}>
          {codec === 'copy' ? i18n.t('options.copyAudio') : codec.toUpperCase()}
        </option>
      {/each}
    </select>
  </Field>

  <Field
    label={i18n.t('options.audioPackaging')}
    forId="output-audio-packaging"
    description={i18n.t('settings.help.audioPackaging')}
  >
    <select id="output-audio-packaging" bind:value={options.audioPackaging} onchange={changed}>
      <option value="mux">{i18n.t('options.integrated')}</option>
      <option value="separate">{i18n.t('options.separate')}</option>
    </select>
  </Field>

  <Field
    label={i18n.t('subtitles.strategy')}
    forId="output-subtitle-strategy"
    description={i18n.t('settings.help.subtitleStrategy')}
  >
    <select id="output-subtitle-strategy" bind:value={options.subtitleStrategy} onchange={changed}>
      <option value="mirror-source">{strategyLabel('mirror-source')}</option>
      <option value="muxed">{strategyLabel('muxed')}</option>
      <option value="separate">{strategyLabel('separate')}</option>
      <option value="burn" disabled={!capabilities.burnIn}>{strategyLabel('burn')}</option>
      <option value="none">{strategyLabel('none')}</option>
    </select>
  </Field>
</div>

{#if upscaleWarning}
  <p class="note small upscale-note">
    {i18n.t('options.noUpscale', { quality: options.quality ?? '' })}
  </p>
{/if}

{#if showHardware && capabilities.hardware.available}
  <div class="hardware-field">
    <label class="hardware-check">
      <input
        id="output-hardware"
        type="checkbox"
        checked={options.hardwareAcceleration !== false}
        onchange={(event) => {
          options.hardwareAcceleration = (event.currentTarget as HTMLInputElement).checked
          changed()
        }}
      />
      <span class="hardware-copy">
        <span class="hardware-title">{i18n.t('options.hardware')}</span>
        <span class="muted small">{i18n.t('options.hardwareHint')}</span>
      </span>
    </label>
  </div>
{/if}

<style>
  .upscale-note {
    margin: 0.65rem 0 0;
  }
</style>
