/**
 * Pinterest marketing snapshot orchestration.
 *
 * Parallel-fetches the user account, a 30-day analytics window, and
 * the pin count, then builds the MarketingSnapshot. Same caching shape
 * as the other mode-specific snapshots (5-min TTL in the shared cache).
 *
 * Returns null when no Pinterest account is connected (widgets fall
 * back to mock). Any provider error is caught, flagged on the row, and
 * returned as null so the UI degrades cleanly.
 */

import { cache } from '../cache'
import { markSynced } from '../accounts'
import type { MarketingSnapshot } from '../marketing/model'
import {
  countUserPins,
  getUserAccount,
  getUserAnalytics,
} from './fetch'
import { buildMarketingKpis } from './normalize'
import {
  PINTEREST_SERVICE,
  loadPinterestCredentials,
  markPinterestError,
} from './tokens'

const SNAPSHOT_TTL_SEC = 5 * 60
const WINDOW_DAYS = 30

function snapshotKey(companyId: string): string {
  return `pinterest:snapshot:${companyId}`
}

/** YYYY-MM-DD in UTC. Pinterest's analytics endpoint expects calendar dates. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getMarketingSnapshot(
  companyId: string
): Promise<MarketingSnapshot | null> {
  const cached = await cache.get<MarketingSnapshot>(snapshotKey(companyId))
  if (cached) return cached

  const creds = await loadPinterestCredentials(companyId)
  if (!creds) return null

  const now = new Date()
  const start = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const startDate = isoDate(start)
  const endDate = isoDate(now)

  try {
    const [account, analytics, publishedPins] = await Promise.all([
      getUserAccount(creds.accessToken),
      getUserAnalytics({
        accessToken: creds.accessToken,
        startDate,
        endDate,
      }),
      countUserPins({ accessToken: creds.accessToken }),
    ])

    const kpis = buildMarketingKpis({ account, analytics, publishedPins })

    const snapshot: MarketingSnapshot = {
      generatedAt: new Date().toISOString(),
      provider: {
        id: account.id,
        name: account.username,
        accountType: account.account_type ?? null,
      },
      kpis,
    }

    await cache.set(snapshotKey(companyId), snapshot, SNAPSHOT_TTL_SEC)
    await markSynced(companyId, PINTEREST_SERVICE)
    return snapshot
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markPinterestError(companyId, msg)
    return null
  }
}

export async function invalidateMarketingSnapshot(companyId: string): Promise<void> {
  await cache.invalidate(`pinterest:snapshot:${companyId}`)
}
