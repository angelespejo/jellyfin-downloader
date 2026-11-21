<script lang="ts">
  import type { Capabilities } from '#lib/types.js'
  import { formatBytes } from '#lib/format.js'
  import {
    API_VERSION,
    APP_AUTHOR,
    APP_AUTHOR_EMAIL,
    APP_AUTHOR_URL,
    APP_DESCRIPTION,
    APP_FUNDING,
    APP_HOMEPAGE,
    APP_LICENSE,
    APP_NAME,
    APP_REPOSITORY,
    APP_VERSION,
  } from '#const'
  import { getI18n } from '#core/i18n.svelte.js'
  import ModalShell from '#lib/components/modal-shell.svelte'
  import Icon from '#lib/components/icon.svelte'

  let {
    open,
    onclose,
    capabilities,
    storage,
  }: {
    open: boolean
    onclose: () => void
    capabilities: Capabilities
    storage: { enabled: boolean; usedBytes: number; objects: number }
  } = $props()

  const i18n = getI18n()

  const HARDWARE_LABELS: Record<string, string> = {
    videotoolbox: 'VideoToolbox',
    nvenc: 'NVENC',
    qsv: 'Intel QSV',
    vaapi: 'VAAPI',
  }

  const description = $derived(APP_DESCRIPTION?.trim() || i18n.t('app.tagline'))
  const ffmpegLabel = $derived(
    capabilities.ffmpeg.available
      ? i18n.t('status.ffmpeg', {
          version: capabilities.ffmpeg.version?.split(' ')[2] ?? '',
        })
      : i18n.t('status.ffmpegUnavailable')
  )
  const hardwareLabel = $derived(
    capabilities.hardware.available && capabilities.hardware.mode
      ? (HARDWARE_LABELS[capabilities.hardware.mode] ?? capabilities.hardware.mode)
      : i18n.t('info.hardwareNone')
  )
</script>

<ModalShell {open} {onclose} title={i18n.t('info.title')} width="min(820px, 94vw)">
  <div class="project-info">
    <header class="info-hero">
      <img class="info-logo" src="/jellyfin-icon.svg" alt="" width="52" height="52" />
      <div class="info-hero-body">
        <h3>{APP_NAME}</h3>
        <p>{i18n.t('app.tagline')}</p>
        <div class="info-badges">
          <span class="badge accent">{i18n.t('info.version')} {APP_VERSION}</span>
          <span class="badge">{APP_LICENSE}</span>
        </div>
      </div>
    </header>

    <p class="info-subtitle">{i18n.t('info.subtitle')}</p>
    <p class="info-description">{description}</p>

    <div class="info-grid">
      <section class="info-card">
        <h3>{i18n.t('info.project')}</h3>
        <dl class="info-list">
          <div class="info-row">
            <dt>{i18n.t('info.author')}</dt>
            <dd>
              <a href={APP_AUTHOR_URL} target="_blank" rel="noreferrer">{APP_AUTHOR}</a>
              {#if APP_AUTHOR_EMAIL}
                <a class="info-mail" href={`mailto:${APP_AUTHOR_EMAIL}`}>{APP_AUTHOR_EMAIL}</a>
              {/if}
            </dd>
          </div>
          <div class="info-row">
            <dt>{i18n.t('info.version')}</dt>
            <dd>{APP_VERSION}</dd>
          </div>
          <div class="info-row">
            <dt>{i18n.t('info.license')}</dt>
            <dd>
              {APP_LICENSE}
              <span class="info-note">{i18n.t('info.licenseNote')}</span>
            </dd>
          </div>
          <div class="info-row">
            <dt>{i18n.t('info.repository')}</dt>
            <dd>
              <a href={APP_REPOSITORY} target="_blank" rel="noreferrer">{APP_REPOSITORY}</a>
            </dd>
          </div>
          <div class="info-row">
            <dt>{i18n.t('info.homepage')}</dt>
            <dd>
              <a href={APP_HOMEPAGE} target="_blank" rel="noreferrer">{APP_HOMEPAGE}</a>
            </dd>
          </div>
        </dl>
      </section>

      <section class="info-card">
        <h3>{i18n.t('info.funding')}</h3>
        <p>{i18n.t('info.fundingText')}</p>
        <a class="info-cta" href={APP_FUNDING} target="_blank" rel="noreferrer">
          <Icon name="globe" size={16} />
          {i18n.t('info.fundingCta')}
        </a>
      </section>

      <section class="info-card">
        <h3>{i18n.t('info.api')}</h3>
        <p>{i18n.t('info.apiHint')}</p>
        <dl class="info-list">
          <div class="info-row">
            <dt>{i18n.t('info.apiVersion')}</dt>
            <dd><code>{API_VERSION}</code></dd>
          </div>
          <div class="info-row">
            <dt>{i18n.t('info.apiBase')}</dt>
            <dd><code>/api/{API_VERSION}</code></dd>
          </div>
        </dl>
        <div class="info-links">
          <a href="/api/v1/docs" target="_blank" rel="noreferrer">
            {i18n.t('info.apiDocs')}
          </a>
          <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
            {i18n.t('info.openapi')}
          </a>
          <a href="/api/v1/health" target="_blank" rel="noreferrer">
            {i18n.t('info.health')}
          </a>
        </div>
        <h4>{i18n.t('info.endpoints')}</h4>
        <ul class="info-endpoints">
          <li>
            <code>GET /api/v1/movies</code>
            <span>{i18n.t('info.catalog')}</span>
          </li>
          <li>
            <code>GET /api/v1/series/{'{id}'}</code>
            <span>{i18n.t('info.catalog')}</span>
          </li>
          <li>
            <code>GET /api/v1/presets</code>
            <span>{i18n.t('info.presets')}</span>
          </li>
          <li>
            <code>POST /api/v1/downloads</code>
            <span>{i18n.t('info.downloadsApi')}</span>
          </li>
          <li>
            <code>GET /api/v1/settings</code>
            <span>{i18n.t('info.settingsApi')}</span>
          </li>
          <li>
            <code>GET /api/v1/health</code>
            <span>{i18n.t('info.health')}</span>
          </li>
        </ul>
      </section>

      <section class="info-card">
        <h3>{i18n.t('info.runtime')}</h3>
        <dl class="info-list">
          <div class="info-row">
            <dt>{i18n.t('info.ffmpeg')}</dt>
            <dd>{ffmpegLabel}</dd>
          </div>
          <div class="info-row">
            <dt>{i18n.t('info.hardware')}</dt>
            <dd>{hardwareLabel}</dd>
          </div>
          <div class="info-row">
            <dt>{i18n.t('info.storage')}</dt>
            <dd>
              {#if storage.enabled}
                <span class="badge good">{i18n.t('info.storageOn')}</span>
                {formatBytes(storage.usedBytes, i18n.locale)}
              {:else}
                <span class="badge warn">{i18n.t('info.storageOff')}</span>
              {/if}
            </dd>
          </div>
        </dl>
      </section>

      <section class="info-card info-card-wide">
        <h3>{i18n.t('info.tech')}</h3>
        <p>{i18n.t('info.techStack')}</p>
      </section>
    </div>
  </div>
</ModalShell>

<style>
  .project-info {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .info-hero {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--surface-2) 70%, transparent);
  }

  .info-logo {
    flex: 0 0 auto;
    width: 3.25rem;
    height: 3.25rem;
    object-fit: contain;
  }

  .info-hero-body {
    min-width: 0;
  }

  .info-hero-body h3 {
    margin: 0;
    font-size: 1.25rem;
    letter-spacing: -0.02em;
  }

  .info-hero-body p {
    margin: 0.2rem 0 0;
    color: var(--muted);
    font-size: 0.88rem;
  }

  .info-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.55rem;
  }

  .info-subtitle {
    margin: 0;
    font-weight: 600;
  }

  .info-description {
    margin: -0.35rem 0 0;
    color: var(--muted);
    line-height: 1.55;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem;
  }

  .info-card {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--surface) 70%, transparent);
  }

  .info-card-wide {
    grid-column: 1 / -1;
  }

  .info-card h3 {
    margin: 0;
    font-size: 0.95rem;
    letter-spacing: -0.01em;
  }

  .info-card h4 {
    margin: 0.25rem 0 0;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .info-card p {
    margin: 0;
    color: var(--muted);
    font-size: 0.86rem;
    line-height: 1.5;
  }

  .info-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin: 0;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    gap: 0.9rem;
    font-size: 0.84rem;
  }

  .info-row dt {
    flex: 0 0 auto;
    color: var(--muted);
  }

  .info-row dd {
    margin: 0;
    overflow-wrap: anywhere;
    text-align: right;
  }

  .info-row dd a {
    overflow-wrap: anywhere;
  }

  .info-mail {
    display: block;
    font-size: 0.78rem;
  }

  .info-note {
    display: block;
    color: var(--muted);
    font-size: 0.78rem;
  }

  .info-cta {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 0.45rem;
    margin-top: auto;
    padding: 0.55rem 0.9rem;
    border-radius: 10px;
    background: var(--accent);
    color: var(--surface);
    font-weight: 650;
  }

  .info-cta:hover {
    background: var(--accent-strong);
    text-decoration: none;
  }

  .info-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.85rem;
    font-size: 0.84rem;
  }

  .info-links a {
    font-weight: 600;
  }

  .info-endpoints {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .info-endpoints li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 65%, transparent);
    font-size: 0.8rem;
  }

  .info-endpoints li:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }

  .info-endpoints code {
    white-space: nowrap;
  }

  .info-endpoints span {
    color: var(--muted);
    font-size: 0.76rem;
    text-align: right;
  }

  @media (max-width: 640px) {
    .info-hero {
      align-items: flex-start;
    }

    .info-grid {
      grid-template-columns: 1fr;
    }

    .info-row {
      flex-direction: column;
      gap: 0.15rem;
    }

    .info-row dd {
      text-align: left;
    }

    .info-endpoints li {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.15rem;
    }

    .info-endpoints span {
      text-align: left;
    }
  }
</style>
