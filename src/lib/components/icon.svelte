<script lang="ts">
  import type { IconName } from '#lib/types.js'

  let { name, size = 18, label }: { name: IconName; size?: number; label?: string } = $props()

  const icons: Record<IconName, string[]> = {
    search: ['M21 21l-4.35-4.35', 'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z'],
    settings: ['M4 6h16', 'M4 12h16', 'M4 18h16', 'M8 4v4', 'M16 10v4', 'M10 16v4'],
    download: ['M12 3v12', 'M8 11l4 4 4-4', 'M4 19h16'],
    folder: ['M3 7h6l2 2h10v10H3z'],
    edit: ['M4 20h4L18 10l-4-4L4 16v4z', 'M14 6l4 4'],
    trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
    close: ['M6 6l12 12', 'M18 6L6 18'],
    plus: ['M12 5v14', 'M5 12h14'],
    globe: [
      'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
      'M3 12h18',
      'M12 3a15 15 0 0 1 0 18',
      'M12 3a15 15 0 0 0 0 18',
    ],
    sun: [
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
      'M12 2v2',
      'M12 20v2',
      'M4.9 4.9l1.4 1.4',
      'M17.7 17.7l1.4 1.4',
      'M2 12h2',
      'M20 12h2',
      'M4.9 19.1l1.4-1.4',
      'M17.7 6.3l1.4-1.4',
    ],
    moon: ['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z'],
    monitor: ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'],
    info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v6', 'M12 7h.01'],
    check: ['M5 12l4 4L19 6'],
    film: ['M4 4h16v16H4z', 'M8 4v16', 'M16 4v16', 'M4 8h4', 'M4 16h4', 'M16 8h4', 'M16 16h4'],
    api: ['M8 9l-3 3 3 3', 'M16 9l3 3-3 3', 'M14 5l-4 14'],
    play: ['M8 5v14l11-7z'],
    clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  }
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  {#each icons[name] as path, index (index)}
    <path d={path}></path>
  {/each}
</svg>

<style>
  .icon {
    display: inline-block;
    flex: 0 0 auto;
    vertical-align: -0.15em;
  }
</style>
