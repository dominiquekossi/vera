/**
 * Caches the in-flight promise, not just the settled value, so that two
 * components asking for the same variant share one request. Rejections are
 * evicted so a failed source can be retried instead of caching the failure.
 */
export function createCache<T>() {
  const entries = new Map<string, Promise<T>>()

  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = entries.get(key)
      if (hit) return hit

      const pending = load().catch((error: unknown) => {
        entries.delete(key)
        throw error
      })
      entries.set(key, pending)
      return pending
    },
    clear() {
      entries.clear()
    },
    get size() {
      return entries.size
    },
  }
}
