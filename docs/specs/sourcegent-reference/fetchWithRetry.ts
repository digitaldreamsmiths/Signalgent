/**
 * Fetch with automatic retry on transient failures.
 * Retries on network errors and 5xx status codes.
 * Does NOT retry on 4xx (client errors) — those are permanent.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit & { retries?: number; retryDelay?: number },
): Promise<Response> {
  const maxRetries = init?.retries ?? 2
  const baseDelay = init?.retryDelay ?? 1000

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, init)

      // Don't retry client errors (4xx) — they won't succeed on retry
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res
      }

      // Server error (5xx) — retry
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) // exponential backoff: 1s, 2s, 4s
        console.warn(`fetchWithRetry: ${res.status} from ${typeof input === 'string' ? input : 'request'}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      return res // final attempt, return whatever we got
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt)
        console.warn(`fetchWithRetry: network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, lastError.message)
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }

  throw lastError ?? new Error('fetchWithRetry: all attempts failed')
}
