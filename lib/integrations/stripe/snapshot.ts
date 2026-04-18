/**
 * Finance snapshot orchestration.
 *
 * Composes tokens + fetch + normalize + cache + status updates. This is
 * the single entry point that server actions/components call to get a
 * live FinanceSnapshot for a given company.
 *
 * Returns null when the company has no connected Stripe account (widgets
 * fall back to mock in that case). Any provider error is caught, flagged
 * on the account row, and returned as null so the UI degrades cleanly.
 */

import { cache } from '../cache'
import type { FinanceSnapshot } from '../finance/model'
import {
  listBalanceTransactions,
  retrieveAccount,
  type StripeBalanceTransaction,
} from './fetch'
import { normalizeToSnapshot } from './normalize'
import {
  loadStripeCredentials,
  markStripeError,
} from './tokens'
import { markSynced } from '../accounts'

const SNAPSHOT_TTL_SEC = 5 * 60 // 5 minutes
const LOOKBACK_DAYS = 70 // enough to cover 8 weekly buckets + 30-day prev period

function snapshotKey(companyId: string): string {
  return `stripe:snapshot:${companyId}`
}

export async function getFinanceSnapshot(companyId: string): Promise<FinanceSnapshot | null> {
  // 1. Cache hit?
  const cached = await cache.get<FinanceSnapshot>(snapshotKey(companyId))
  if (cached) return cached

  // 2. Credentials?
  const creds = await loadStripeCredentials(companyId)
  if (!creds) return null

  // 3. Fetch + normalize
  try {
    const createdAfter = Math.floor((Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000)

    const [account, firstPage] = await Promise.all([
      retrieveAccount(creds.accessToken),
      listBalanceTransactions({ accessToken: creds.accessToken, createdAfter, limit: 100 }),
    ])

    // Paginate up to a hard cap to bound work per request.
    const all: StripeBalanceTransaction[] = [...firstPage.data]
    let page = firstPage
    let safety = 0
    while (page.has_more && safety < 5) {
      const last = page.data[page.data.length - 1]
      page = await listBalanceTransactions({
        accessToken: creds.accessToken,
        createdAfter,
        limit: 100,
        startingAfter: last.id,
      })
      all.push(...page.data)
      safety++
    }

    const snapshot = normalizeToSnapshot({
      transactions: all,
      currency: account.default_currency ?? 'usd',
    })

    await cache.set(snapshotKey(companyId), snapshot, SNAPSHOT_TTL_SEC)
    await markSynced(companyId, 'stripe_account')
    return snapshot
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markStripeError(companyId, msg)
    return null
  }
}

export async function invalidateFinanceSnapshot(companyId: string): Promise<void> {
  await cache.invalidate(`stripe:snapshot:${companyId}`)
}
