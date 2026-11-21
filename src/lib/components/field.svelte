<script lang="ts">
  import { browser } from '$app/env'
  import { slide } from 'svelte/transition'
  import Icon from '#lib/components/icon.svelte'
  import { getI18n } from '#core/i18n.svelte.js'

  let {
    label,
    forId,
    description,
    children,
  }: {
    label: string
    forId?: string
    description?: string
    children: import('svelte').Snippet
  } = $props()

  const i18n = getI18n()
  const reduceMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const fieldId = $props.id()
  const helpId = `${fieldId}-help`
  let expanded = $state(false)
</script>

<div class="field">
  <div class="field-head">
    <label for={forId}>{label}</label>
    {#if description}
      <button
        type="button"
        class={['field-info', { expanded }, 'hover-shine']}
        aria-expanded={expanded}
        aria-controls={helpId}
        aria-label={i18n.t(expanded ? 'common.lessInfo' : 'common.moreInfo')}
        title={description}
        onclick={() => (expanded = !expanded)}
      >
        <Icon name="info" size={15} />
      </button>
    {/if}
  </div>
  {@render children()}
  {#if description && expanded}
    <p id={helpId} class="field-help" transition:slide={{ duration: reduceMotion ? 0 : 160 }}>
      {description}
    </p>
  {/if}
</div>

<style>
  .field-help {
    margin: 0.15rem 0 0;
    color: var(--muted);
    font-size: 0.76rem;
    line-height: 1.4;
  }
</style>
