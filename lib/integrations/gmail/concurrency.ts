/**
 * Shared Gmail batch-fetch concurrency + rate-limit handling.
 *
 * Gmail's undocumented per-user concurrent-request ceiling 429s under
 * 'rateLimitExceeded' / 'Too many concurrent requests' well before the
 * published QPS quota — empirically ~5 concurrent keeps a 200-thread batch
 * clean, paired with a short inter-batch pause so a slow response doesn't let
 * the next batch stack on top, and a narrow retry-with-backoff on the 429s that
 * still slip through. Used by both the response-stats computation and the
 * reply/bounce scanner.
 */

export const THREAD_FETCH_CONCURRENCY = 5
export const INTER_BATCH_PAUSE_MS = 120
export const MAX_RETRIES_ON_RATE_LIMIT = 3
export const RETRY_BACKOFF_MS = 600

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isRateLimitError(err: unknown): boolean {
  return err instanceof Error && /\(429\)|rateLimitExceeded|RESOURCE_EXHAUSTED/i.test(err.message)
}

/** Run `worker` over `items` in fixed-size concurrent batches, pausing between
 * batches. Order of results matches input order. */
export async function runChunked<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  pauseBetweenBatchesMs = 0,
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency)
    const results = await Promise.all(slice.map(worker))
    out.push(...results)
    if (pauseBetweenBatchesMs > 0 && i + concurrency < items.length) {
      await sleep(pauseBetweenBatchesMs)
    }
  }
  return out
}

/** Retry `fn` on Gmail rate-limit (429) errors with linear backoff. Non-429
 * errors propagate immediately. */
export async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0
  let lastErr: unknown
  while (attempt <= MAX_RETRIES_ON_RATE_LIMIT) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isRateLimitError(err)) throw err
      attempt += 1
      if (attempt > MAX_RETRIES_ON_RATE_LIMIT) break
      await sleep(RETRY_BACKOFF_MS * attempt)
    }
  }
  throw lastErr
}
