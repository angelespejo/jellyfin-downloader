import { browser } from '$app/env'
import { getContext, setContext } from 'svelte'

export type NotificationLevel = 'info' | 'success' | 'warn' | 'error'

export interface NotificationInput {
  level: NotificationLevel
  message: string
  duration?: number
}

export interface NotificationItem extends NotificationInput {
  id: string
}

export interface NotificationsContext {
  readonly items: NotificationItem[]
  notify(input: NotificationInput): void
  dismiss(id: string): void
}

const NOTIFICATIONS_KEY = Symbol('jellyfin-downloader-notifications')
const MAX_VISIBLE = 4
const DEFAULT_DURATION: Record<NotificationLevel, number> = {
  info: 5000,
  success: 5000,
  warn: 7000,
  error: 9000,
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `notice-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createNotifications(): NotificationsContext {
  let items = $state<NotificationItem[]>([])
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function dismiss(id: string): void {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    items = items.filter((item) => item.id !== id)
  }

  function notify(input: NotificationInput): void {
    const item: NotificationItem = {
      ...input,
      id: newId(),
      duration: input.duration ?? DEFAULT_DURATION[input.level],
    }
    items = [...items, item].slice(-MAX_VISIBLE)
    if (!browser) return
    const timer = setTimeout(() => dismiss(item.id), item.duration)
    timers.set(item.id, timer)
  }

  const context: NotificationsContext = {
    get items() {
      return items
    },
    notify,
    dismiss,
  }
  setContext(NOTIFICATIONS_KEY, context)
  return context
}

const fallback: NotificationsContext = {
  items: [],
  notify: () => undefined,
  dismiss: () => undefined,
}

export function getNotifications(): NotificationsContext {
  return getContext<NotificationsContext>(NOTIFICATIONS_KEY) ?? fallback
}
