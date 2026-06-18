/**
 * Free, dependency-light deliverability check used at ingest. We resolve each
 * domain's MX records (with an A-record fallback per RFC 5321, since a domain
 * with an A record but no MX can still receive mail). A domain is only flagged
 * undeliverable when DNS *definitively* says it can receive no mail — no MX and
 * no A record. Any timeout or unexpected DNS error is treated as deliverable, so
 * a transient hiccup never silently drops a real prospect.
 */

import { promises as dns } from 'node:dns'

const TIMEOUT_MS = 3000
const DEFINITIVE = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN'])

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS)),
  ])
}

async function lookupDeliverable(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain)
    if (mx.length > 0) return true
    // empty MX set → fall through to A-record fallback
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    // Unexpected/transient DNS error → be lenient, don't reject.
    if (!code || !DEFINITIVE.has(code)) return true
  }
  try {
    const a = await dns.resolve4(domain)
    return a.length > 0
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code && DEFINITIVE.has(code)) return false
    return true
  }
}

/**
 * Given a list of domains, return the set that definitively cannot receive mail.
 * Dedupes internally and checks domains concurrently; each lookup is bounded by
 * a short timeout that defaults to "deliverable" so DNS slowness never blocks
 * ingest.
 */
export async function undeliverableDomains(domains: string[]): Promise<Set<string>> {
  const unique = [...new Set(domains)]
  const results = await Promise.all(
    unique.map(async (d) => [d, await withTimeout(lookupDeliverable(d), true)] as const),
  )
  return new Set(results.filter(([, ok]) => !ok).map(([d]) => d))
}
