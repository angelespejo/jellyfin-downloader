<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    id,
    title,
    open = $bindable(true),
    actions,
    children,
  }: {
    id: string
    title: string
    open?: boolean
    actions?: Snippet
    children: Snippet
  } = $props()

  const panelId = $derived(`${id}-content`)
</script>

<section class="collapsible">
  <div class="collapsible-head">
    <button
      type="button"
      class="collapsible-toggle"
      aria-expanded={open}
      aria-controls={panelId}
      onclick={() => (open = !open)}
    >
      <span class="chevron" class:open aria-hidden="true">▸</span>
      <span class="collapsible-title">{title}</span>
    </button>
    {#if actions}
      <div class="collapsible-actions">{@render actions()}</div>
    {/if}
  </div>
  {#if open}
    <div id={panelId} class="collapsible-body">
      {@render children()}
    </div>
  {/if}
</section>

<style>
  .collapsible {
    margin-top: 0.9rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--line);
  }

  .collapsible-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .collapsible-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.2rem 0.4rem 0.2rem 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-weight: 700;
    text-align: left;
  }

  .chevron {
    display: inline-block;
    color: var(--muted);
    transition: transform 140ms ease;
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .collapsible-title {
    font-size: 0.95rem;
  }

  .collapsible-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .collapsible-body {
    margin-top: 0.7rem;
  }
</style>
