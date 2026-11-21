<script lang="ts">
  import type { MovieSummary } from '#lib/types.js'
  import { getI18n } from '#core/i18n.svelte.js'
  import Icon from '#lib/components/icon.svelte'

  let {
    movie,
    selected = false,
    onselect,
  }: {
    movie: MovieSummary
    selected?: boolean
    onselect: (movie: MovieSummary) => void
  } = $props()

  const i18n = getI18n()
  const poster = $derived(
    movie.imageTag
      ? `/api/v1/artwork/${movie.id}?tag=${encodeURIComponent(movie.imageTag)}&w=300`
      : null
  )

  const kind = $derived(movie.kind ?? 'movie')
  const kindLabel = $derived(
    kind === 'series'
      ? i18n.t('media.series')
      : kind === 'episode'
        ? i18n.t('media.episode')
        : kind === 'homevideo'
          ? i18n.t('media.homevideo')
          : i18n.t('media.movie')
  )
</script>

<button
  type="button"
  class={['movie-card', 'card-border-flash', { selected }]}
  aria-pressed={selected}
  onclick={() => onselect(movie)}
>
  <span class="movie-poster-wrap">
    {#if poster}
      <img class="movie-poster" src={poster} alt="" loading="lazy" />
    {:else}
      <span class="movie-poster placeholder" aria-hidden="true">
        {movie.title.slice(0, 1).toUpperCase()}
      </span>
    {/if}
    <span class="movie-kind" data-kind={kind}>{kindLabel}</span>
    {#if movie.downloadCount > 0}
      <span
        class="download-count"
        title={i18n.t('movies.downloadsCount', { count: movie.downloadCount })}
      >
        <Icon name="download" size={12} />
        {movie.downloadCount}
      </span>
    {/if}
  </span>
  <span class="movie-info">
    <span class="movie-title">{movie.title}</span>
    <span class="movie-meta">{movie.year ?? i18n.t('movies.unknownYear')}</span>
  </span>
</button>

<style>
  .movie-card {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    overflow: hidden;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    transition:
      transform 140ms ease,
      border-color 140ms ease,
      background 140ms ease;
  }

  .movie-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
    background: var(--surface);
  }

  .movie-card.selected {
    border-color: var(--accent);
    box-shadow:
      0 0 0 2px var(--accent-soft),
      var(--shadow);
  }

  .movie-poster-wrap {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 2 / 3;
    background: var(--surface-2);
  }

  .movie-poster {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .movie-poster.placeholder {
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: 2rem;
    font-weight: 750;
  }

  .download-count {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.45rem;
    border-radius: 999px;
    background: rgba(7, 8, 10, 0.78);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 700;
    backdrop-filter: blur(6px);
  }

  .movie-kind {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.45rem;
    border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 76%, transparent);
    color: var(--text);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    line-height: 1.2;
    text-transform: uppercase;
    pointer-events: none;
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
  }

  .movie-kind[data-kind='series'] {
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    background: color-mix(in srgb, var(--accent-soft) 70%, var(--surface));
    color: var(--accent);
  }

  .movie-kind[data-kind='homevideo'] {
    border-color: color-mix(in srgb, var(--line) 85%, transparent);
    background: color-mix(in srgb, var(--surface-2) 80%, transparent);
    color: var(--muted);
  }

  .movie-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.7rem 0.75rem 0.8rem;
  }

  .movie-title {
    font-weight: 650;
    line-height: 1.25;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .movie-meta {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
