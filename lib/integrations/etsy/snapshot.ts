/**
 * Etsy commerce snapshot orchestration.
 *
 * Single entry point that the commerce snapshot context calls to get a
 * live `CommerceSnapshot` for a company. Composes creds + fetch +
 * normalize + cache + status updates. Mirrors the GA4 snapshot.
 *
 * Trailing 30-day window. Pagination hard-capped at 5 pages (500
 * receipts) — enough to cover any reasonable small-business volume
 * while bounding API-budget blowups on pathologically active shops.
 *
 * Returns null when the company has no connected Etsy account (widgets
 * fall back to mock). Any provider error is caught, flagged on the
 * account row, and returned as null so the UI degrades cleanly.
 */

import { cache } from '../cache'
import { markSynced } from '../accounts'
import type { CommerceSnapshot } from '../commerce/model'
import { listShopReceipts, type EtsyReceipt } from './fetch'
import { buildOrderStats } from './normalize'
import {
  ETSY_SERVICE,
  loadEtsyCredentials,
  markEtsyError,
} from './tokens'

const SNAPSHOT_TTL_SEC = 5 * 60
const WINDOW_DAYS = 30
const PAGE_SIZE = 100
const MAX_PAGES = 5

function snapshotKey(companyId: string): string {
  return `etsy:snapshot:${companyId}`
}

export async function getCommerceSnapshot(
  companyId: string
): Promise<CommerceSnapshot | null> {
  const cached = await cache.get<CommerceSnapshot>(snapshotKey(companyId))
  if (cached) return cached

  const creds = await loadEtsyCredentials(companyId)
  if (!creds) return null

  const nowSec = Math.floor(Date.now() / 1000)
  const sinceUnix = nowSec - WINDOW_DAYS * 24 * 60 * 60

  try {
    const receipts = await collectReceipts({
      accessToken: creds.accessToken,
      shopId: creds.shopId,
      sinceUnix,
    })

    const orderStats = buildOrderStats({
      receipts,
      currencyCode: creds.currencyCode,
      sinceUnix,
    })

    const snapshot: CommerceSnapshot = {
      generatedAt: new Date().toISOString(),
      shop: {
        shopId: creds.shopId,
        shopName: creds.shopName,
        currencyCode: creds.currencyCode,
      },
      orderStats,
    }

    await cache.set(snapshotKey(companyId), snapshot, SNAPSHOT_TTL_SEC)
    await markSynced(companyId, ETSY_SERVICE)
    return snapshot
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markEtsyError(companyId, msg)
    return null
  }
}

export async function invalidateCommerceSnapshot(companyId: string): Promise<void> {
  await cache.invalidate(`etsy:snapshot:${companyId}`)
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

async function collectReceipts(args: {
  accessToken: string
  shopId: number
  sinceUnix: number
}): Promise<EtsyReceipt[]> {
  const all: EtsyReceipt[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { results } = await listShopReceipts({
      accessToken: args.accessToken,
      shopId: args.shopId,
      minCreated: args.sinceUnix,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
    if (!results || results.length === 0) break
    all.push(...results)
    if (results.length < PAGE_SIZE) break
  }
  return all
}
