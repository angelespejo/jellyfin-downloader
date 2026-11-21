<script lang="ts">
  import { page } from '$app/state'
  import { getI18n } from '#core/i18n.svelte.js'

  const i18n = getI18n()
  const notFound = $derived(page.status === 404)
</script>

<div class="panel">
  <div class="panel-body empty">
    <span class={['badge', { bad: !notFound }]}>Error: {page.status}</span>
    <h1>{notFound ? i18n.t('page.notFound') : i18n.t('page.unexpected')}</h1>
    <p class="muted">
      {notFound ? i18n.t('page.notFoundHint') : i18n.t('page.unexpectedHint')}
    </p>
    <a class="badge accent hover-shine" href="/">{i18n.t('page.home')}</a>
  </div>
</div>
