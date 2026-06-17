/**
 * Shared HTTP client with timeout, retry, and circuit-breaker semantics for
 * external market-data APIs. Never throws — always returns a typed result so
 * the runner can fall back to cached data without wrapping in try/catch.
 *
 * The "circuit breaker" is soft: we retry on failure with exponential backoff,
 * but past the retry budget we surface failure rather than throwing. Treating
 * external API outages as data states (not exceptions) keeps the runner's
 * happy-path linear.
 */

export interface FetchOptions {
  /** Per-attempt timeout. Default 10000ms. */
  timeoutMs?: number
  /** Retry attempts after initial failure. Default 2 (so up to 3 attempts total). */
  retries?: number
  /** Initial retry delay in ms; doubles each retry (1000 → 2000 → 4000). Default 1000. */
  retryDelayMs?: number
}

export type FetchResult<T> =
  | { data: T; source: 'live'; durationMs: number }
  | { data: null; source: 'failed'; error: string; durationMs: number }

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RETRIES = 2
const DEFAULT_RETRY_DELAY_MS = 1_000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Single-attempt fetch with timeout. Returns parsed JSON of type T or throws.
 * Treat thrown errors as transient by default — the caller re-tries.
 */
async function fetchOnce<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch with retry + exponential backoff. Always resolves; never throws.
 *
 * On retry-exhausted failure: { data: null, source: 'failed', error }.
 * On success: { data, source: 'live' }.
 *
 * The caller is expected to fall back to cache when source === 'failed'.
 */
export async function fetchWithCircuitBreaker<T>(
  url: string,
  init: RequestInit = {},
  options: FetchOptions = {},
): Promise<FetchResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? DEFAULT_RETRIES
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS

  const start = Date.now()
  let lastError = ''

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const data = await fetchOnce<T>(url, init, timeoutMs)
      return { data, source: 'live', durationMs: Date.now() - start }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      if (attempt < retries) {
        const delay = retryDelayMs * Math.pow(2, attempt)
        await sleep(delay)
      }
    }
  }

  return {
    data: null,
    source: 'failed',
    error: lastError,
    durationMs: Date.now() - start,
  }
}
