<script lang="ts">
  import Icon from './icon.svelte'
  import type { TabItem } from '#lib/types.js'

  let {
    tabs,
    active = $bindable(),
    label,
    idPrefix = 'tab',
    sticky = false,
  }: {
    tabs: TabItem[]
    active: string
    label: string
    idPrefix?: string
    sticky?: boolean
  } = $props()

  // The default prefix keeps the historical `tab-*` / `panel-*` ids so existing
  // consumers keep working; custom prefixes namespace both ids.
  function tabDomId(id: string): string {
    return idPrefix === 'tab' ? `tab-${id}` : `${idPrefix}-tab-${id}`
  }

  function panelDomId(id: string): string {
    return idPrefix === 'tab' ? `panel-${id}` : `${idPrefix}-panel-${id}`
  }

  function select(id: string): void {
    active = id
  }

  function onKeydown(event: KeyboardEvent, index: number): void {
    if (
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return
    }
    event.preventDefault()
    const target =
      event.key === 'Home'
        ? tabs[0]
        : event.key === 'End'
          ? tabs[tabs.length - 1]
          : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
    if (!target) return
    select(target.id)
    document.getElementById(tabDomId(target.id))?.focus()
  }
</script>

<div class={['tabs', { sticky }]} role="tablist" aria-orientation="horizontal" aria-label={label}>
  {#each tabs as tab, index (tab.id)}
    <button
      id={tabDomId(tab.id)}
      type="button"
      role="tab"
      aria-selected={active === tab.id}
      aria-controls={panelDomId(tab.id)}
      tabindex={active === tab.id ? 0 : -1}
      class={['tab', { active: active === tab.id }, 'hover-shine']}
      onclick={() => select(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      {#if tab.icon}<Icon name={tab.icon} size={16} />{/if}
      <span>{tab.label}</span>
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 0.3rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
  }

  .tabs::-webkit-scrollbar {
    display: none;
  }

  .tabs.sticky {
    position: sticky;
    top: 0;
    z-index: 4;
    margin-bottom: 0.9rem;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    box-shadow: 0 10px 18px -18px var(--text);
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    white-space: nowrap;
    padding: 0.5rem 0.75rem;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--muted);
    font-size: 0.86rem;
    font-weight: 600;
  }

  .tab:hover {
    background: var(--surface-2);
  }

  .tab.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
