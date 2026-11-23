<script lang="ts">
  import type { PageData } from './$types'
  import type {
    DownloadOptionsInput,
    LogEntry,
    LogLevel,
    LogsResponse,
    Preset,
    PresetOptions,
    SettingsDocument,
    TabItem,
  } from '#lib/types.js'
  import { formatBytes, formatTimestamp } from '#lib/format.js'
  import {
    DEFAULT_PRESET_TAG,
    formatPresetTags,
    parsePresetTagInput,
    PresetTagError,
  } from '#lib/presets.js'
  import { getI18n } from '#core/i18n.svelte.js'
  import { getNotifications } from '#core/notifications.svelte.js'
  import { getTheme } from '#core/theme.svelte.js'
  import Field from '#lib/components/field.svelte'
  import Icon from '#lib/components/icon.svelte'
  import ModalShell from '#lib/components/modal-shell.svelte'
  import ConfirmDialog from '#lib/components/confirm-dialog.svelte'
  import Tabs from '#lib/components/tabs.svelte'
  import OutputSettings from '#lib/ui/output-settings.svelte'
  import { infiniteScroll } from '#lib/actions/infinite-scroll.js'
  import type { LocaleMode, ThemeMode } from '#lib/types.js'

  let { data }: { data: PageData } = $props()
  const i18n = getI18n()
  const theme = getTheme()
  const notifications = getNotifications()

  function cloneSettings(value: SettingsDocument): SettingsDocument {
    return structuredClone(value)
  }

  function optionsFromDefaults(document: SettingsDocument): DownloadOptionsInput {
    return {
      container: document.defaults.container,
      quality: document.defaults.quality,
      videoCodec: document.defaults.videoCodec,
      audioCodec: document.defaults.audioCodec,
      audioSelection: document.defaults.audioSelection,
      audioPackaging: document.defaults.audioPackaging,
      subtitleSelection: document.defaults.subtitleSelection,
      subtitleStrategy: document.defaults.subtitleStrategy,
    }
  }

  function defaultPresetOptions(): DownloadOptionsInput {
    return optionsFromDefaults(settings)
  }

  // svelte-ignore state_referenced_locally
  let settings = $state<SettingsDocument>(cloneSettings(data.settings))
  // svelte-ignore state_referenced_locally
  let defaults = $state<DownloadOptionsInput>(optionsFromDefaults(settings))
  let activeTab = $state('appearance')
  let saving = $state(false)
  let saveMessage = $state<string | null>(null)
  let saveError = $state<string | null>(null)
  let presetOpen = $state(false)
  let editingId = $state<string | null>(null)
  let presetMeta = $state({ id: '', name: '', description: '', tags: '' })
  let presetOptions = $state<DownloadOptionsInput>(defaultPresetOptions())
  let presetError = $state<string | null>(null)
  let pendingPreset = $state<Preset | null>(null)
  let logLevel = $state<'' | LogLevel>('')
  let logs = $state<LogEntry[]>([])
  let logsCount = $state(0)
  let logsRetentionDays = $state(0)
  let logsLoading = $state(false)
  let logsLoadingMore = $state(false)
  let logsHasMore = $state(false)
  let logsOffset = $state(0)
  let logsRequest = 0
  let logsError = $state<string | null>(null)
  let logsLoaded = $state(false)
  let logsClearing = $state(false)
  let pendingClearLogs = $state(false)

  const LOGS_PAGE_SIZE = 20

  const tabs = $derived<TabItem[]>([
    { id: 'appearance', label: i18n.t('settings.tab.appearance'), icon: 'sun' },
    { id: 'defaults', label: i18n.t('settings.tab.defaults'), icon: 'settings' },
    { id: 'presets', label: i18n.t('settings.tab.presets'), icon: 'film' },
    { id: 'storage', label: i18n.t('settings.tab.storage'), icon: 'folder' },
    { id: 'logs', label: i18n.t('settings.tab.logs'), icon: 'info' },
  ])

  function slugify(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  }

  async function save(message = i18n.t('settings.saved')): Promise<boolean> {
    saving = true
    saveError = null
    saveMessage = null
    try {
      const response = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const payload = (await response.json()) as {
        settings?: SettingsDocument
        error?: { code?: string; message?: string }
      }
      if (!response.ok || !payload.settings) {
        saveError = i18n.error(
          payload.error?.code,
          payload.error?.message ?? i18n.t('settings.saveError')
        )
        notifications.notify({ level: 'error', message: saveError })
        return false
      }
      settings = payload.settings
      saveMessage = message
      notifications.notify({ level: 'success', message })
      return true
    } catch {
      saveError = i18n.t('errors.JELLYFIN_ERROR')
      notifications.notify({ level: 'error', message: saveError })
      return false
    } finally {
      saving = false
    }
  }

  async function saveDefaults(): Promise<void> {
    const d = defaults
    settings.defaults = {
      container: d.container ?? 'source',
      quality: d.quality ?? 'original',
      videoCodec: d.videoCodec ?? 'copy',
      audioCodec: d.audioCodec ?? 'copy',
      audioSelection: d.audioSelection ?? 'all',
      audioPackaging: d.audioPackaging ?? 'mux',
      subtitleSelection: d.subtitleSelection ?? 'all',
      subtitleStrategy: d.subtitleStrategy ?? 'mirror-source',
    }
    await save(i18n.t('settings.defaultsSaved'))
  }

  function openPreset(preset?: Preset): void {
    presetError = null
    if (preset) {
      editingId = preset.id
      presetMeta = {
        id: preset.id,
        name: preset.name,
        description: preset.description ?? '',
        tags: formatPresetTags(preset.tags),
      }
      presetOptions = { ...defaultPresetOptions(), ...preset.options }
    } else {
      editingId = null
      presetMeta = { id: '', name: '', description: '', tags: DEFAULT_PRESET_TAG }
      presetOptions = defaultPresetOptions()
    }
    presetOpen = true
  }

  function closePreset(): void {
    presetOpen = false
    presetError = null
  }

  async function savePreset(): Promise<void> {
    if (!presetMeta.name.trim()) {
      presetError = i18n.t('settings.presetNameRequired')
      notifications.notify({ level: 'error', message: presetError })
      return
    }
    let tags: string[]
    try {
      tags = parsePresetTagInput(presetMeta.tags)
    } catch (error) {
      if (!(error instanceof PresetTagError)) throw error
      presetError = i18n.t('settings.presetTagsInvalid')
      notifications.notify({ level: 'error', message: presetError })
      return
    }
    const id = editingId ?? (slugify(presetMeta.id || presetMeta.name) || `preset-${Date.now()}`)
    if (settings.presets.some((preset) => preset.id === id && preset.id !== editingId)) {
      presetError = i18n.t('settings.presetExists')
      notifications.notify({ level: 'error', message: presetError })
      return
    }
    const options: PresetOptions = {
      container: presetOptions.container,
      quality: presetOptions.quality,
      videoCodec: presetOptions.videoCodec,
      audioCodec: presetOptions.audioCodec,
      audioSelection: presetOptions.audioSelection,
      audioPackaging: presetOptions.audioPackaging,
      subtitleSelection: presetOptions.subtitleSelection,
      subtitleStrategy: presetOptions.subtitleStrategy,
    }
    const preset: Preset = {
      id,
      name: presetMeta.name.trim(),
      ...(presetMeta.description.trim() ? { description: presetMeta.description.trim() } : {}),
      tags,
      options,
    }
    settings.presets = editingId
      ? settings.presets.map((candidate) => (candidate.id === editingId ? preset : candidate))
      : [...settings.presets, preset]
    if (await save(i18n.t('settings.presetSaved'))) {
      presetOpen = false
      editingId = null
    } else {
      presetError = saveError
    }
  }

  async function deletePreset(): Promise<void> {
    const preset = pendingPreset
    if (!preset) return
    settings.presets = settings.presets.filter((candidate) => candidate.id !== preset.id)
    await save(i18n.t('settings.presetDeleted'))
    pendingPreset = null
  }

  async function loadLogs(reset = true): Promise<void> {
    const request = ++logsRequest
    if (reset) {
      logsLoading = true
      logsOffset = 0
      logsHasMore = false
    } else {
      logsLoadingMore = true
    }
    logsError = null
    try {
      const params = new URLSearchParams({
        limit: String(LOGS_PAGE_SIZE),
        offset: String(reset ? 0 : logsOffset),
      })
      if (logLevel) params.set('level', logLevel)
      const response = await fetch(`/api/v1/logs?${params.toString()}`)
      const payload = (await response.json()) as Partial<LogsResponse> & {
        error?: { code?: string; message?: string }
      }
      if (request !== logsRequest) return
      if (!response.ok) {
        logsError = i18n.error(payload.error?.code, payload.error?.message ?? i18n.t('logs.error'))
        return
      }
      const entries = payload.entries ?? []
      if (reset) {
        logs = entries
      } else {
        const seen = new Set(logs.map((entry) => entry.id))
        logs = [...logs, ...entries.filter((entry) => !seen.has(entry.id))]
      }
      logsOffset = (payload.offset ?? 0) + entries.length
      logsCount = payload.total ?? logs.length
      logsHasMore = payload.hasMore ?? false
      logsRetentionDays = payload.retentionDays ?? 0
      logsLoaded = true
    } catch {
      if (request === logsRequest) logsError = i18n.t('logs.error')
    } finally {
      if (request === logsRequest) {
        logsLoading = false
        logsLoadingMore = false
      }
    }
  }

  function loadMoreLogs(): void {
    if (!logsHasMore || logsLoading || logsLoadingMore) return
    void loadLogs(false)
  }

  async function clearLogs(): Promise<void> {
    logsClearing = true
    logsError = null
    try {
      const response = await fetch('/api/v1/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string }
        } | null
        logsError = i18n.error(
          payload?.error?.code,
          payload?.error?.message ?? i18n.t('logs.error')
        )
        notifications.notify({ level: 'error', message: logsError })
        return
      }
      pendingClearLogs = false
      notifications.notify({ level: 'success', message: i18n.t('logs.cleared') })
      await loadLogs()
    } catch {
      logsError = i18n.t('logs.error')
      notifications.notify({ level: 'error', message: logsError })
    } finally {
      logsClearing = false
    }
  }

  function setLogLevel(event: Event): void {
    logLevel = (event.currentTarget as HTMLSelectElement).value as '' | LogLevel
    void loadLogs()
  }

  function levelLabel(level: LogLevel): string {
    if (level === 'warn') return i18n.t('logs.levelWarn')
    if (level === 'error') return i18n.t('logs.levelError')
    return i18n.t('logs.levelInfo')
  }

  function loadLogsOnMount(_node: HTMLElement): void {
    void loadLogs()
  }

  function setLocale(event: Event): void {
    i18n.setMode((event.currentTarget as HTMLSelectElement).value as LocaleMode)
  }

  function setTheme(event: Event): void {
    theme.setMode((event.currentTarget as HTMLSelectElement).value as ThemeMode)
  }

  function normalizeOutputOptions(): void {
    if (presetOptions.quality !== 'original' && presetOptions.videoCodec === 'copy') {
      presetOptions.videoCodec = 'h264'
    }
    if (presetOptions.subtitleStrategy === 'burn' && presetOptions.videoCodec === 'copy') {
      presetOptions.videoCodec = 'h264'
    }
  }

  function normalizeDefaults(): void {
    if (defaults.quality !== 'original' && defaults.videoCodec === 'copy') {
      defaults.videoCodec = 'h264'
    }
    if (defaults.subtitleStrategy === 'burn' && defaults.videoCodec === 'copy') {
      defaults.videoCodec = 'h264'
    }
  }
</script>

<div class="hero">
  <div>
    <h1>{i18n.t('settings.title')}</h1>
    <p>{i18n.t('settings.subtitle')}</p>
  </div>
  <!-- <span class={['badge', { good: data.storage.enabled, warn: !data.storage.enabled }]}>
    {data.storage.enabled
      ? i18n.t('settings.storageOn', { size: formatBytes(data.storage.usedBytes, i18n.locale) })
      : i18n.t('settings.storageOff')}
  </span> -->
</div>

{#if data.warning}<div class="note warn" role="status">{i18n.t('page.settingsWarning')}</div>{/if}

{#if saveError}<div class="error-box" role="alert">{saveError}</div>{/if}
{#if saveMessage}<div class="success-box" role="status">{saveMessage}</div>{/if}

<Tabs {tabs} bind:active={activeTab} label={i18n.t('settings.title')} />

{#if activeTab === 'appearance'}
  <div
    class="panel tab-panel"
    id="panel-appearance"
    role="tabpanel"
    aria-labelledby="tab-appearance"
  >
    <div class="panel-head">
      <h2>{i18n.t('settings.tab.appearance')}</h2>
    </div>
    <div class="panel-body">
      <p class="muted small">{i18n.t('settings.appearanceHint')}</p>
      <div class="grid-2" style="margin-top: 1rem;">
        <Field
          label={i18n.t('language.label')}
          forId="settings-language"
          description={i18n.t('settings.help.language')}
        >
          <select id="settings-language" value={i18n.mode} onchange={setLocale}>
            <option value="auto">{i18n.t('language.auto')}</option>
            <option value="en">{i18n.t('language.en')}</option>
            <option value="es">{i18n.t('language.es')}</option>
            <option value="ca">{i18n.t('language.ca')}</option>
          </select>
        </Field>
        <Field
          label={i18n.t('theme.label')}
          forId="settings-theme"
          description={i18n.t('settings.help.theme')}
        >
          <select id="settings-theme" value={theme.mode} onchange={setTheme}>
            <option value="system">{i18n.t('theme.system')}</option>
            <option value="light">{i18n.t('theme.light')}</option>
            <option value="dark">{i18n.t('theme.dark')}</option>
          </select>
        </Field>
      </div>
    </div>
  </div>
{:else if activeTab === 'defaults'}
  <div class="panel tab-panel" id="panel-defaults" role="tabpanel" aria-labelledby="tab-defaults">
    <div class="panel-head">
      <h2>{i18n.t('settings.defaults')}</h2>
      <button class="primary hover-shine" disabled={saving} onclick={saveDefaults}>
        <Icon name="check" size={16} />
        {saving ? i18n.t('common.saving') : i18n.t('common.save')}
      </button>
    </div>
    <div class="panel-body">
      <OutputSettings
        bind:options={defaults}
        capabilities={data.capabilities}
        onqualitychange={normalizeDefaults}
      />
      <p class="note small" style="margin-top: 1rem;">{i18n.t('settings.defaultsNote')}</p>
    </div>
  </div>
{:else if activeTab === 'presets'}
  <div class="panel tab-panel" id="panel-presets" role="tabpanel" aria-labelledby="tab-presets">
    <div class="panel-head">
      <h2>{i18n.t('settings.presets')}</h2>
      <button class="primary hover-shine" onclick={() => openPreset()}>
        <Icon name="plus" size={16} />
        {i18n.t('settings.newPreset')}
      </button>
    </div>
    <div class="panel-body">
      <p class="muted small" style="margin-bottom: 0.8rem;">{i18n.t('settings.presetsHint')}</p>
      {#if settings.presets.length === 0}
        <div class="empty">
          <strong>{i18n.t('settings.noPresets')}</strong>
        </div>
      {:else}
        {#each settings.presets as preset (preset.id)}
          <div class="preset-item">
            <div>
              <h4>{preset.name}</h4>
              <p>{preset.description ?? '—'}</p>
              {#if preset.tags.length}
                <div class="preset-tags">
                  {#each preset.tags as tag (tag)}
                    <span class="badge">{tag}</span>
                  {/each}
                </div>
              {/if}
              <p class="small">
                {preset.options.container === 'source'
                  ? i18n.t('options.source')
                  : (preset.options.container ?? 'source').toUpperCase()} ·
                {preset.options.quality ?? i18n.t('options.original')} ·
                {preset.options.videoCodec ?? 'copy'} · {preset.options.audioCodec ?? 'copy'} ·
                {preset.options.subtitleStrategy ?? 'mirror-source'}
              </p>
            </div>
            <div class="preset-actions">
              <button
                class="ghost icon-btn hover-shine"
                onclick={() => openPreset(preset)}
                aria-label={i18n.t('common.edit')}
              >
                <Icon name="edit" size={16} />
              </button>
              <button
                class="danger icon-btn hover-shine"
                onclick={() => (pendingPreset = preset)}
                aria-label={i18n.t('common.delete')}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{:else if activeTab === 'storage'}
  <div class="panel tab-panel" id="panel-storage" role="tabpanel" aria-labelledby="tab-storage">
    <div class="panel-head">
      <h2>{i18n.t('settings.tab.storage')}</h2>
      <a class="badge accent hover-shine" href="/downloads">
        <Icon name="folder" size={14} />
        {i18n.t('downloads.title')}
      </a>
    </div>
    <div class="panel-body">
      <p class="muted small">{i18n.t('settings.storageHint')}</p>
      <div class="grid-2" style="margin-top: 1rem;">
        <div class="note">
          <strong>{i18n.t('settings.storage')}</strong><br />
          {data.storage.enabled
            ? i18n.t('settings.storageOn', {
                size: formatBytes(data.storage.usedBytes, i18n.locale),
              })
            : i18n.t('settings.storageOff')}
        </div>
        <div class="note">
          <strong>{i18n.t('downloads.count', { count: data.storage.objects })}</strong><br />
          {i18n.t('settings.help.storage')}
        </div>
      </div>
    </div>
  </div>
{:else}
  <div
    class="panel tab-panel"
    id="panel-logs"
    role="tabpanel"
    aria-labelledby="tab-logs"
    {@attach loadLogsOnMount}
  >
    <div class="panel-head">
      <h2>{i18n.t('settings.tab.logs')}</h2>
      <a class="badge accent hover-shine" href="/api/v1/logs?download=1" download>
        <Icon name="download" size={14} />
        {i18n.t('logs.download')}
      </a>
    </div>
    <div class="panel-body">
      <p class="muted small">{i18n.t('logs.subtitle')}</p>
      <div class="logs-toolbar">
        <Field label={i18n.t('logs.level')} forId="logs-level">
          <select id="logs-level" value={logLevel} onchange={setLogLevel}>
            <option value="">{i18n.t('logs.levelAll')}</option>
            <option value="info">{i18n.t('logs.levelInfo')}</option>
            <option value="warn">{i18n.t('logs.levelWarn')}</option>
            <option value="error">{i18n.t('logs.levelError')}</option>
          </select>
        </Field>
        <div class="logs-actions">
          <button
            class="hover-shine"
            type="button"
            disabled={logsLoading}
            onclick={() => void loadLogs()}
          >
            {i18n.t('logs.refresh')}
          </button>
          <button
            type="button"
            class="danger hover-shine"
            disabled={logsLoading || logsClearing}
            onclick={() => (pendingClearLogs = true)}
          >
            <Icon name="trash" size={15} />
            {i18n.t('logs.clear')}
          </button>
        </div>
      </div>
      <p class="muted small">{i18n.t('logs.serverOnly')}</p>

      {#if logsLoaded}
        <div class="logs-meta">
          <span>{i18n.t('logs.retention', { days: logsRetentionDays })}</span>
          <span>{i18n.t('logs.count', { count: logsCount })}</span>
        </div>
      {/if}

      {#if logsLoading}
        <div class="note" role="status">{i18n.t('logs.loading')}</div>
      {:else if logsError}
        <div class="error-box" role="alert">{logsError}</div>
      {:else if logs.length === 0}
        <div class="empty">
          <strong>{i18n.t('logs.empty')}</strong>
          <p class="muted small">{i18n.t('logs.emptyHint')}</p>
        </div>
      {:else}
        <ul class="log-list">
          {#each logs as entry (entry.id)}
            {@const details = Object.entries(entry.context ?? {})}
            <li class="log-item">
              <div class="log-head">
                <time datetime={entry.timestamp}>
                  {formatTimestamp(entry.timestamp, i18n.locale)}
                </time>
                <span
                  class={[
                    'badge',
                    entry.level === 'error' ? 'bad' : entry.level === 'warn' ? 'warn' : '',
                  ]}
                >
                  {levelLabel(entry.level)}
                </span>
              </div>
              <div class="log-body">
                <code class="log-event">{entry.event}</code>
                <p class="log-message">{entry.message}</p>
              </div>
              {#if details.length}
                <details class="log-details">
                  <summary>{i18n.t('logs.context')}</summary>
                  <dl class="log-context">
                    {#each details as [key, value] (key)}
                      <div>
                        <dt>{key}</dt>
                        <dd>{value === null ? '—' : String(value)}</dd>
                      </div>
                    {/each}
                  </dl>
                </details>
              {/if}
            </li>
          {/each}
        </ul>
        {#if logsHasMore}
          <div
            class="logs-more"
            use:infiniteScroll={{
              enabled: logsHasMore && !logsLoading && !logsLoadingMore,
              load: loadMoreLogs,
            }}
          >
            <button
              type="button"
              class="ghost hover-shine"
              disabled={logsLoadingMore}
              onclick={loadMoreLogs}
            >
              {logsLoadingMore ? i18n.t('common.loadingMore') : i18n.t('common.loadMore')}
            </button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<ModalShell
  open={presetOpen}
  title={editingId ? i18n.t('settings.editPreset') : i18n.t('settings.createPreset')}
  onclose={closePreset}
  width="min(820px, 94vw)"
>
  <div class="grid-2">
    <Field
      label={i18n.t('settings.presetName')}
      forId="preset-name"
      description={i18n.t('settings.help.presetName')}
    >
      <input
        id="preset-name"
        bind:value={presetMeta.name}
        placeholder={i18n.t('settings.presetNamePlaceholder')}
      />
    </Field>
    <Field
      label={i18n.t('settings.presetId')}
      forId="preset-id"
      description={i18n.t('settings.help.presetId')}
    >
      <input
        id="preset-id"
        bind:value={presetMeta.id}
        placeholder="mp4-480p"
        disabled={Boolean(editingId)}
      />
    </Field>
    <div style="grid-column: 1 / -1;">
      <Field label={i18n.t('settings.presetDescription')} forId="preset-description">
        <input
          id="preset-description"
          bind:value={presetMeta.description}
          placeholder={i18n.t('settings.presetDescriptionPlaceholder')}
        />
      </Field>
    </div>
    <div style="grid-column: 1 / -1;">
      <Field
        label={i18n.t('settings.presetTags')}
        forId="preset-tags"
        description={i18n.t('settings.help.presetTags')}
      >
        <input
          id="preset-tags"
          bind:value={presetMeta.tags}
          placeholder={i18n.t('settings.presetTagsPlaceholder')}
        />
      </Field>
    </div>
  </div>
  <div class="section">
    <OutputSettings
      bind:options={presetOptions}
      capabilities={data.capabilities}
      onchange={normalizeOutputOptions}
      onqualitychange={() => normalizeOutputOptions()}
    />
  </div>
  {#if presetError}<div class="error-box" role="alert">{presetError}</div>{/if}
  <div class="actions">
    <button class="primary hover-shine" disabled={saving} onclick={savePreset}>
      <Icon name="check" size={16} />
      {saving ? i18n.t('common.saving') : i18n.t('common.save')}
    </button>
    <button class="ghost hover-shine" onclick={closePreset}>{i18n.t('common.cancel')}</button>
  </div>
</ModalShell>

<ConfirmDialog
  open={pendingPreset !== null}
  title={i18n.t('settings.deletePresetTitle')}
  message={i18n.t('settings.deletePresetMessage', { id: pendingPreset?.id ?? '' })}
  confirmLabel={i18n.t('common.delete')}
  busy={saving}
  onconfirm={deletePreset}
  oncancel={() => (pendingPreset = null)}
/>

<ConfirmDialog
  open={pendingClearLogs}
  title={i18n.t('logs.clearTitle')}
  message={i18n.t('logs.clearMessage')}
  confirmLabel={i18n.t('logs.clear')}
  busy={logsClearing}
  onconfirm={clearLogs}
  oncancel={() => (pendingClearLogs = false)}
/>

<style>
  .logs-toolbar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.8rem;
    flex-wrap: wrap;
    margin: 1rem 0 0.4rem;
  }

  .logs-toolbar :global(select) {
    min-width: 10rem;
  }

  .logs-actions {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .logs-actions button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.7rem;
    font-size: 0.82rem;
  }

  .logs-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem 0.8rem;
    flex-wrap: wrap;
    margin: 0.7rem 0;
    color: var(--muted);
    font-size: 0.78rem;
  }

  .log-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin: 0.6rem 0 0;
    padding: 0;
    list-style: none;
  }

  .logs-more {
    display: flex;
    justify-content: center;
    margin-top: 0.75rem;
  }

  .log-item {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }

  .log-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .log-head time {
    color: var(--muted);
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
  }

  .log-body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .log-event {
    align-self: flex-start;
    font-size: 0.75rem;
    font-weight: 650;
    color: var(--accent);
    overflow-wrap: anywhere;
  }

  .log-message {
    margin: 0;
    font-size: 0.84rem;
    overflow-wrap: anywhere;
  }

  .log-details {
    margin-top: 0.15rem;
    font-size: 0.78rem;
  }

  .log-details summary {
    cursor: pointer;
    color: var(--muted);
    font-weight: 600;
  }

  .log-details summary:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--focus-ring) 55%, transparent);
    outline-offset: 2px;
    border-radius: 6px;
  }

  .log-context {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin: 0.4rem 0 0;
  }

  .log-context div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.7rem;
  }

  .log-context dt {
    color: var(--muted);
  }

  .log-context dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
</style>
