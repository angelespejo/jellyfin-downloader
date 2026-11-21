<script lang="ts">
  import { browser } from '$app/env'
  import { fly } from 'svelte/transition'
  import { getI18n } from '#core/i18n.svelte.js'
  import { getNotifications } from '#core/notifications.svelte.js'
  import Icon from './icon.svelte'

  const i18n = getI18n()
  const notifications = getNotifications()
  const reduceMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches
</script>

<div class="notification-stack" aria-live="polite" aria-atomic="false">
  {#each notifications.items as item (item.id)}
    <div
      class={['notification', item.level]}
      role={item.level === 'error' ? 'alert' : 'status'}
      transition:fly={{ y: -8, duration: reduceMotion ? 0 : 180 }}
    >
      <span class="notification-icon" aria-hidden="true">
        <Icon name={item.level === 'success' ? 'check' : 'info'} size={17} />
      </span>
      <span class="notification-message">{item.message}</span>
      <button
        type="button"
        class="notification-close hover-shine"
        aria-label={i18n.t('common.close')}
        onclick={() => notifications.dismiss(item.id)}
      >
        <Icon name="close" size={15} />
      </button>
    </div>
  {/each}
</div>

<style>
  .notification-stack {
    position: fixed;
    top: 4.9rem;
    right: max(1rem, calc((100vw - 1400px) / 2));
    z-index: 1200;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
    width: min(420px, calc(100vw - 2rem));
    pointer-events: none;
  }

  .notification {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
    width: 100%;
    padding: 0.7rem 0.75rem;
    border: 1px solid var(--line);
    border-left: 3px solid var(--accent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    -webkit-backdrop-filter: blur(16px);
    backdrop-filter: blur(16px);
    box-shadow: var(--shadow);
    pointer-events: auto;
  }

  .notification.success {
    border-left-color: var(--success);
  }
  .notification.warn {
    border-left-color: var(--warning);
  }
  .notification.error {
    border-left-color: var(--danger);
  }

  .notification-icon {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    margin-top: 0.1rem;
    color: var(--accent);
  }
  .notification.success .notification-icon {
    color: var(--success);
  }
  .notification.warn .notification-icon {
    color: var(--warning);
  }
  .notification.error .notification-icon {
    color: var(--danger);
  }

  .notification-message {
    flex: 1;
    min-width: 0;
    font-size: 0.85rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .notification-close {
    flex: 0 0 auto;
    display: inline-grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
  }
  .notification-close:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  @media (max-width: 760px) {
    .notification-stack {
      top: 8.5rem;
      right: 0.75rem;
      width: calc(100vw - 1.5rem);
    }
  }
</style>
