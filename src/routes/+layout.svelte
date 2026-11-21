<script lang="ts">
  import '../app.css'
  import { page } from '$app/state'
  import { onNavigate } from '$app/navigation'
  import { API_VERSION, APP_AUTHOR, APP_AUTHOR_URL, APP_FUNDING, APP_VERSION } from '#const'
  import { createI18n } from '#core/i18n.svelte.js'
  import { createTheme } from '#core/theme.svelte.js'
  import { createNotifications } from '#core/notifications.svelte.js'
  import { formatBytes } from '#lib/format.js'
  import Icon from '#lib/components/icon.svelte'
  import NotificationStack from '#lib/components/notification-stack.svelte'
  import ProjectInfoModal from '#lib/ui/project-info-modal.svelte'

  let { data, children } = $props()

  // svelte-ignore state_referenced_locally
  const i18n = createI18n(data.locale, data.localeMode)
  // svelte-ignore state_referenced_locally
  createTheme(data.themeMode)
  // svelte-ignore state_referenced_locally
  createNotifications()

  let infoOpen = $state(false)

  const current = $derived(page.url.pathname)
  const ffmpegVersion = $derived(data.capabilities.ffmpeg.version?.split(' ')[2] ?? '')

  onNavigate((navigation) => {
    if (navigation.shallow) return
    if (!navigation.from || !navigation.to) return
    if (navigation.to.url.pathname === navigation.from.url.pathname) return
    if (typeof document === 'undefined' || !document.startViewTransition) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    return new Promise<void>((resolve) => {
      document.startViewTransition(async () => {
        resolve()
        await navigation.complete
      })
    })
  })
</script>

<svelte:head>
  <title>{i18n.t('app.title')}</title>
  <meta name="description" content={i18n.t('app.tagline')} />
</svelte:head>

<div class="app-shell">
  <a class="skip-link" href="#main-content">{i18n.t('nav.skip')}</a>
  <header class="topbar">
    <a class="brand" href="/" aria-label={i18n.t('app.title')}>
      <img class="brand-mark" src="/jellyfin-icon.svg" alt="" />
      <span>{i18n.t('app.title')}</span>
    </a>
    <nav class="nav" aria-label={i18n.t('nav.main')}>
      <a href="/" aria-current={current === '/' ? 'page' : undefined}>
        <Icon name="film" size={16} />
        {i18n.t('nav.movies')}
      </a>
      <a href="/downloads" aria-current={current.startsWith('/downloads') ? 'page' : undefined}>
        <Icon name="download" size={16} />
        {i18n.t('nav.downloads')}
      </a>
      <a href="/settings" aria-current={current.startsWith('/settings') ? 'page' : undefined}>
        <Icon name="settings" size={16} />
        {i18n.t('nav.settings')}
      </a>
    </nav>
  </header>

  <main id="main-content" class="main" tabindex="-1">
    {@render children()}
  </main>

  <footer class="footer">
    <div class="footer-main">
      <button
        type="button"
        class="footer-info hover-shine"
        aria-haspopup="dialog"
        onclick={() => (infoOpen = true)}
      >
        <Icon name="info" size={14} />
        {i18n.t('footer.info')}
      </button>
      <div class="footer-status">
        <span
          class={[
            'badge',
            {
              good: data.capabilities.ffmpeg.available,
              bad: !data.capabilities.ffmpeg.available,
            },
          ]}
        >
          {data.capabilities.ffmpeg.available
            ? i18n.t('status.ffmpeg', { version: ffmpegVersion })
            : i18n.t('status.ffmpegUnavailable')}
        </span>
        {#if data.storage.enabled}
          <a class="badge good hover-shine" href="/downloads">
            <Icon name="folder" size={13} />
            {i18n.t('status.localDownloads', {
              size: formatBytes(data.storage.usedBytes, i18n.locale),
            })}
          </a>
        {:else}
          <span class="badge warn">{i18n.t('status.localDownloadsOff')}</span>
        {/if}
      </div>
    </div>
    <div class="footer-meta">
      <span>Made with ❤️ by <a href={APP_FUNDING}>{APP_AUTHOR}</a></span>
      <span>{i18n.t('footer.version', { version: APP_VERSION })}</span>
      <!-- <span>{i18n.t('footer.version', { version: APP_VERSION })}</span>
      <button
        type="button"
        class="footer-info hover-shine"
        aria-haspopup="dialog"
        onclick={() => (infoOpen = true)}
      >
        <Icon name="info" size={14} />
        {i18n.t('footer.info')}
      </button>
      <a href="/api/v1/docs" target="_blank" rel="noreferrer">
        <Icon name="api" size={14} />
        {i18n.t('footer.apiDocs')}
      </a>
      <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
        {i18n.t('footer.openapi')}
      </a>
      <code>{i18n.t('footer.apiBase', { version: API_VERSION })}</code> -->
    </div>
  </footer>

  <ProjectInfoModal
    open={infoOpen}
    onclose={() => (infoOpen = false)}
    capabilities={data.capabilities}
    storage={data.storage}
  />
</div>

<NotificationStack />
