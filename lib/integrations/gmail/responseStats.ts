/**
 * Gmail response-stats computation.
 *
 * Walks every inbox thread touched in the last 30 days, then traverses each
 * thread's messages to decide whether the mailbox owner replied and how
 * long it took. The Gmail label `SENT` identifies owner-authored messages;
 * `INBOX` identifies inbound messages. A thread is "responded" when any
 * SENT-labeled message has an `internalDate` strictly after the earliest
 * INBOX-labeled message in the same thread.
 *
 * Semantics (per-thread, by design):
 *   - responseRate  = respondedThreads / inboundThreads × 100, rounded.
 *   - avgResponseTimeHours = mean(firstSent − firstInbound) across
 *     responded threads, in hours.
 *   - Sample = threads with at least one inbound message in the last 30d.
 *     A reply outside the 30d window still counts as responding to an
 *     inbound inside the window.
 *
 * Returns null when:
 *   - The sample is empty (no inbound in 30d).
 *   - Any upstream Gmail call fails — widgets fall back to mock.
 *
 * Cache key is company-scoped with a 30-minute TTL. The metric is a 30-day
 * trailing average, so a 30-minute refresh is more than tight enough and
 * spares us from re-traversing hundreds of threads on every snapshot fetch.
 */

import { cache } from '../cache'
import {
  getThread,
  listThreads,
  type GmailMessage,
  type GmailThreadRef,
} from './fetch'
import {
  THREAD_FETCH_CONCURRENCY,
  INTER_BATCH_PAUSE_MS,
  runChunked,
  withRateLimitRetry,
} from './concurrency'

const CACHE_TTL_SEC = 30 * 60
const MAX_THREADS = 200 // cap traversal for bounded latency on huge inboxes

export interface GmailResponseStats {
  responseRate: number
  avgResponseTimeHours: number
  /** Threads considered — useful for debugging and future "low sample" UI. */
  sampleSize: number
}

function cacheKey(companyId: string): string {
  return `gmail:response-stats:${companyId}`
}

function internalDateMs(msg: GmailMessage): number | null {
  const ms = Number(msg.internalDate)
  return Number.isFinite(ms) ? ms : null
}

function hasLabel(msg: GmailMessage, label: string): boolean {
  return (msg.labelIds ?? []).includes(label)
}

interface ThreadVerdict {
  firstInbound: number
  firstSentAfter: number | null
}

function analyzeThread(messages: GmailMessage[]): ThreadVerdict | null {
  let firstInbound: number | null = null
  const sentDates: number[] = []

  for (const m of messages) {
    const ts = internalDateMs(m)
    if (ts === null) continue
    if (hasLabel(m, 'INBOX')) {
      if (firstInbound === null || ts < firstInbound) firstInbound = ts
    }
    if (hasLabel(m, 'SENT')) {
      sentDates.push(ts)
    }
  }

  if (firstInbound === null) return null

  sentDates.sort((a, b) => a - b)
  const firstSentAfter = sentDates.find((d) => d > firstInbound!) ?? null
  return { firstInbound, firstSentAfter }
}

/**
 * Compute response-rate and average-reply-time over the last 30 days.
 * Cached per company for 30 minutes.
 */
export async function computeResponseStats(
  companyId: string,
  accessToken: string
): Promise<GmailResponseStats | null> {
  const cached = await cache.get<GmailResponseStats>(cacheKey(companyId))
  if (cached) return cached

  let threadRefs: GmailThreadRef[] = []
  try {
    const list = await listThreads({
      accessToken,
      q: 'in:inbox newer_than:30d',
      maxResults: MAX_THREADS,
    })
    threadRefs = list.threads ?? []
  } catch (err) {
    console.warn('[response-stats] listThreads failed:', err instanceof Error ? err.message : err)
    return null
  }

  if (threadRefs.length === 0) return null

  const startedAt = Date.now()
  // Per-thread failures (persistent 429s, auth hiccups on a single row,
  // etc.) shouldn't invalidate the whole statistic — fall through with
  // the successful subset. We only return null when we end up with zero
  // usable threads.
  let threadFailures = 0
  const threadResults = await runChunked(
    threadRefs,
    THREAD_FETCH_CONCURRENCY,
    async (ref) => {
      try {
        return await withRateLimitRetry(() => getThread({ accessToken, id: ref.id, format: 'minimal' }))
      } catch (err) {
        threadFailures += 1
        console.warn(
          '[response-stats] thread dropped:',
          err instanceof Error ? err.message.split('\n')[0] : err
        )
        return null
      }
    },
    INTER_BATCH_PAUSE_MS
  )
  const threads = threadResults.filter((t): t is NonNullable<typeof t> => t !== null)
  if (threads.length === 0) {
    console.warn(`[response-stats] all ${threadRefs.length} threads failed`)
    return null
  }

  let responded = 0
  let elapsedTotalMs = 0
  let sampleSize = 0

  for (const thread of threads) {
    const verdict = analyzeThread(thread.messages ?? [])
    if (!verdict) continue
    sampleSize += 1
    if (verdict.firstSentAfter !== null) {
      responded += 1
      elapsedTotalMs += verdict.firstSentAfter - verdict.firstInbound
    }
  }

  if (sampleSize === 0) return null

  const responseRate = Math.round((responded / sampleSize) * 100)
  const avgResponseTimeHours =
    responded > 0 ? elapsedTotalMs / responded / (60 * 60 * 1000) : 0

  const result: GmailResponseStats = {
    responseRate,
    avgResponseTimeHours,
    sampleSize,
  }

  console.info(
    `[response-stats] company=${companyId} threads=${sampleSize} responded=${responded} rate=${responseRate}% avg=${avgResponseTimeHours.toFixed(
      2
    )}h failures=${threadFailures} ms=${Date.now() - startedAt}`
  )

  await cache.set(cacheKey(companyId), result, CACHE_TTL_SEC)
  return result
}

export async function invalidateResponseStats(companyId: string): Promise<void> {
  await cache.invalidate(cacheKey(companyId))
}
