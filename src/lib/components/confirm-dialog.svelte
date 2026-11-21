<script lang="ts">
  import { getI18n } from '#core/i18n.svelte.js'
  import Icon from './icon.svelte'
  import ModalShell from './modal-shell.svelte'

  let {
    open,
    title,
    message,
    confirmLabel,
    onconfirm,
    oncancel,
    busy = false,
  }: {
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    onconfirm: () => void
    oncancel: () => void
    busy?: boolean
  } = $props()

  const i18n = getI18n()
  let cancelButton = $state<HTMLButtonElement | null>(null)

  $effect(() => {
    if (open) cancelButton?.focus()
  })
</script>

<ModalShell
  {open}
  {title}
  onclose={oncancel}
  role="alertdialog"
  describedBy="confirm-dialog-message"
  width="min(460px, 94vw)"
>
  <div class="confirm-body">
    <span class="confirm-icon"><Icon name="trash" size={22} /></span>
    <p id="confirm-dialog-message">{message}</p>
  </div>
  <div class="actions confirm-actions">
    <button
      class="hover-shine"
      bind:this={cancelButton}
      type="button"
      onclick={oncancel}
      disabled={busy}
    >
      {i18n.t('common.cancel')}
    </button>
    <button type="button" class="danger hover-shine" onclick={onconfirm} disabled={busy}>
      <Icon name="trash" size={16} />
      {confirmLabel ?? i18n.t('common.delete')}
    </button>
  </div>
</ModalShell>

<style>
  .confirm-body {
    display: flex;
    align-items: flex-start;
    gap: 0.8rem;
    padding: 0.2rem 0 1.1rem;
  }

  .confirm-body p {
    margin: 0;
    color: var(--muted);
    line-height: 1.55;
  }

  .confirm-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 12px;
    background: var(--danger-soft);
    color: var(--danger);
  }

  .confirm-actions {
    justify-content: flex-end;
    margin-top: 0;
  }
</style>
