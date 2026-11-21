<script lang="ts">
  import Icon from './icon.svelte'

  let {
    title,
    description,
    icon = 'folder',
    variant = 'empty',
  }: {
    title: string
    description?: string
    icon?: 'folder' | 'download' | 'film' | 'search'
    variant?: 'empty' | 'no-results'
  } = $props()
</script>

<div class={['empty-state', variant]} role="status">
  <span class="empty-icon"><Icon name={icon} size={28} /></span>
  <strong>{title}</strong>
  {#if description}<span class="muted small">{description}</span>{/if}
</div>
