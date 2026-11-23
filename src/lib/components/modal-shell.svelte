<script module lang="ts">
  // Modals are portaled to <body>, so they are siblings of `.app-shell`. Track
  // how many are open to toggle `inert` on the shell exactly once.
  let openModalCount = 0

  function setShellInert(inert: boolean): void {
    if (typeof document === 'undefined') return
    const shell = document.querySelector<HTMLElement>('.app-shell')
    if (!shell) return
    if (inert) shell.setAttribute('inert', '')
    else shell.removeAttribute('inert')
  }
</script>

<script lang="ts">
  import { browser } from '$app/env'
  import { fade, scale } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { getI18n } from '#core/i18n.svelte.js'
  import Icon from './icon.svelte'

  let {
    title,
    onclose,
    children,
    width = 'min(980px, 94vw)',
    open = true,
    role = 'dialog',
    describedBy,
  }: {
    title: string
    onclose: () => void
    children: import('svelte').Snippet
    width?: string
    open?: boolean
    role?: 'dialog' | 'alertdialog'
    describedBy?: string
  } = $props()

  const i18n = getI18n()
  const titleId = $props.id()
  const reduceMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let dialog = $state<HTMLDivElement | null>(null)

  // Portal the backdrop out of `.main` (which creates a stacking context via
  // `view-transition-name: page-content`) so it paints above the sticky header.
  function portal(node: HTMLElement) {
    if (typeof document === 'undefined') return
    document.body.appendChild(node)
    return { destroy: () => node.remove() }
  }

  $effect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    openModalCount += 1
    if (openModalCount === 1) setShellInert(true)

    dialog?.focus()

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onclose()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    window.addEventListener('keydown', onKeydown)
    return () => {
      window.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = bodyOverflow
      openModalCount = Math.max(0, openModalCount - 1)
      if (openModalCount === 0) setShellInert(false)
      previous?.focus()
    }
  })
</script>

{#if open}
  <div
    class="modal-backdrop"
    role="presentation"
    use:portal
    transition:fade={{ duration: reduceMotion ? 0 : 160 }}
    onclick={(event) => {
      if (event.target === event.currentTarget) onclose()
    }}
  >
    <div
      class="modal"
      {role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      tabindex="-1"
      bind:this={dialog}
      style={`--modal-width: ${width}`}
      transition:scale={{
        start: 0.96,
        opacity: 0,
        duration: reduceMotion ? 0 : 220,
        easing: cubicOut,
      }}
    >
      <header class="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          class="icon-btn hover-shine"
          onclick={onclose}
          aria-label={i18n.t('common.close')}
        >
          <Icon name="close" size={20} />
        </button>
      </header>
      <div class="modal-body">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: var(--modal-backdrop);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(10px);
  }

  .modal {
    width: var(--modal-width);
    max-height: min(880px, 92vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: var(--modal-surface);
    -webkit-backdrop-filter: blur(20px) saturate(1.12);
    backdrop-filter: blur(20px) saturate(1.12);
    box-shadow: var(--shadow);
    outline: none;
  }

  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.2rem;
    border-bottom: 1px solid var(--line);
    background: var(--modal-head);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
  }

  .modal-head h2 {
    margin: 0;
    font-size: 1.1rem;
    letter-spacing: -0.02em;
  }

  .modal-body {
    padding: 1.2rem;
    overflow: auto;
  }

  .icon-btn {
    display: inline-grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    padding: 0;
    border-radius: 999px;
  }

  @media (max-width: 640px) {
    .modal-backdrop {
      padding: 0;
      align-items: end;
    }

    .modal {
      width: 100%;
      max-height: 94vh;
      border-radius: 18px 18px 0 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal-backdrop,
    .modal {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
