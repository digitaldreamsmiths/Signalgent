/**
 * Integration cache.
 *
 * v1: per-instance in-memory TTL cache. Resets on deploy, not shared across
 * processes. Good enough for development and a single-instance deployment.
 * When that changes, replace the default export with a Redis/Upstash
 * implementation that satisfies the CacheStore interface — no fetcher edits
 * required.
 *
 * Keys are namespaced by the caller (e.g. "stripe:${companyId}:snapshot").
 * TTL is in seconds. Values are serializable objects.
 */

export interface CacheStore {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSec: number): Promise<void>
  invalidate(prefix: string): Promise<void>
}

interface Entry {
  value: unknown
  expiresAt: number
}

class MemoryCache implements CacheStore {
  private store = new Map<string, Entry>()

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return null
    }
    return entry.value as T
  }

  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 })
  }

  async invalidate(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key)
      }
    }
  }
}

// Module-scoped singleton. Dev-server hot-reloads create new instances,
// which is fine — cache loss is expected on reload.
export const cache: CacheStore = new MemoryCache()
