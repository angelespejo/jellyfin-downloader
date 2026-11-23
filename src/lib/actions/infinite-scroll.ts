export interface InfiniteScrollOptions {
  enabled: boolean
  load: () => void
  rootMargin?: string
}

/**
 * Svelte action that calls `load` when the node approaches the viewport.
 * The consumer disables it while a request is in flight.
 */
export function infiniteScroll(node: HTMLElement, options: InfiniteScrollOptions) {
  let current = options
  let observer: IntersectionObserver | null = null

  function disconnect(): void {
    observer?.disconnect()
    observer = null
  }

  function connect(): void {
    disconnect()
    if (!current.enabled || typeof IntersectionObserver === 'undefined') return
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) current.load()
      },
      { rootMargin: current.rootMargin ?? '600px' }
    )
    observer.observe(node)
  }

  connect()

  return {
    update(next: InfiniteScrollOptions) {
      current = next
      connect()
    },
    destroy: disconnect,
  }
}
