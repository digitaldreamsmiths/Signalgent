/**
 * Shape raw Etsy receipts + listings into `CommerceSnapshot` sections.
 *
 * Widgets never see raw Etsy responses — they read the pre-formatted
 * strings produced here. Same pattern as `lib/integrations/ga/normalize.ts`.
 *
 * Conventions:
 *   - All currency values are formatted with a symbol derived from
 *     `currency_code`. Unknown codes fall back to the plain code string.
 *   - Order buckets:
 *       new        = open/unpaid + not canceled
 *       processing = paid + not shipped + not canceled
 *       shipped    = was_shipped + not canceled
 *   - "Low stock" threshold matches `COMMERCE_MOCK` (< 20 units).
 */

import type { EtsyListing, EtsyMoney, EtsyReceipt } from './fetch'
import { moneyToNumber } from './fetch'
import type {
  ActivityEntry,
  OrderCard,
  OrderStats,
  OrdersKanban,
  Product,
  RevenueByProductEntry,
} from '../commerce/model'

const LOW_STOCK_THRESHOLD = 20
const RECENT_ACTIVITY_LIMIT = 5
const KANBAN_PER_COLUMN = 5
const PRODUCTS_LIMIT = 6
const REVENUE_BY_PRODUCT_LIMIT = 6

// ---------------------------------------------------------------------------
// Currency formatting
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  CAD: '$',
  AUD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
}

function formatNumberForCurrency(value: number, code: string): string {
  const isYen = code === 'JPY'
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: isYen ? 0 : 2,
    maximumFractionDigits: isYen ? 0 : 2,
  })
  const symbol = CURRENCY_SYMBOLS[code] ?? ''
  return symbol ? `${symbol}${formatted}` : `${formatted} ${code}`
}

function formatCurrencyUnits(rawUnits: number, divisor: number, code: string): string {
  const value = divisor > 0 ? rawUnits / divisor : rawUnits
  return formatNumberForCurrency(value, code)
}

function formatMoney(m: EtsyMoney, fallbackCode: string): string {
  return formatCurrencyUnits(m.amount, m.divisor, m.currency_code || fallbackCode)
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

function isCanceled(r: EtsyReceipt): boolean {
  if (r.was_canceled) return true
  return r.status.toLowerCase() === 'canceled'
}

function creationUnix(r: EtsyReceipt): number {
  return r.create_timestamp ?? r.created_timestamp ?? 0
}

function lineTotalUnits(t: { quantity: number; price: EtsyMoney }): number {
  return t.price.amount * t.quantity
}

// ---------------------------------------------------------------------------
// OrderStats
// ---------------------------------------------------------------------------

export interface BuildOrderStatsArgs {
  receipts: EtsyReceipt[]
  currencyCode: string
  /** Unix seconds cutoff — receipts older than this are ignored. */
  sinceUnix: number
}

export function buildOrderStats(args: BuildOrderStatsArgs): OrderStats {
  const inWindow = args.receipts.filter((r) => creationUnix(r) >= args.sinceUnix)

  const nonCanceled = inWindow.filter((r) => !isCanceled(r))
  const totalOrders = nonCanceled.length

  const shippedOrders = nonCanceled.filter((r) => r.was_shipped).length
  const newOrders = nonCanceled.filter((r) => r.was_paid && !r.was_shipped).length
  const processingOrders = newOrders

  const paidReceipts = nonCanceled.filter((r) => r.was_paid)
  const revenueUnits = paidReceipts.reduce((acc, r) => acc + r.grandtotal.amount, 0)
  const divisor = paidReceipts[0]?.grandtotal.divisor ?? 100
  const totalRevenue = formatCurrencyUnits(revenueUnits, divisor, args.currencyCode)

  const fulfillmentRate =
    totalOrders === 0
      ? '—'
      : `${Math.round((shippedOrders / totalOrders) * 100)}%`

  return {
    totalOrders,
    newOrders,
    processingOrders,
    shippedOrders,
    totalRevenue,
    fulfillmentRate,
    currencyCode: args.currencyCode,
  }
}

// ---------------------------------------------------------------------------
// Products / LowStock
// ---------------------------------------------------------------------------

export function buildProducts(listings: EtsyListing[], currencyCode: string): Product[] {
  return listings.slice(0, PRODUCTS_LIMIT).map((l) => ({
    id: String(l.listing_id),
    name: l.title,
    price: formatMoney(l.price, currencyCode),
    stock: l.quantity,
  }))
}

/** Filter products to those at or below the low-stock threshold, ordered ascending. */
export function buildLowStock(products: Product[]): Product[] {
  return products
    .filter((p) => p.stock < LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stock - b.stock)
}

// ---------------------------------------------------------------------------
// OrdersKanban
// ---------------------------------------------------------------------------

function toOrderCard(r: EtsyReceipt, currencyCode: string): OrderCard {
  return {
    id: `#${r.receipt_id}`,
    amount: formatMoney(r.grandtotal, currencyCode),
  }
}

export function buildOrdersKanban(
  receipts: EtsyReceipt[],
  currencyCode: string
): OrdersKanban {
  const nonCanceled = receipts.filter((r) => !isCanceled(r))

  const sortByNewest = (a: EtsyReceipt, b: EtsyReceipt) =>
    creationUnix(b) - creationUnix(a)

  const newCol = nonCanceled
    .filter((r) => !r.was_paid)
    .sort(sortByNewest)
    .slice(0, KANBAN_PER_COLUMN)
  const processing = nonCanceled
    .filter((r) => r.was_paid && !r.was_shipped)
    .sort(sortByNewest)
    .slice(0, KANBAN_PER_COLUMN)
  const shipped = nonCanceled
    .filter((r) => r.was_shipped)
    .sort(sortByNewest)
    .slice(0, KANBAN_PER_COLUMN)

  return {
    new: newCol.map((r) => toOrderCard(r, currencyCode)),
    processing: processing.map((r) => toOrderCard(r, currencyCode)),
    shipped: shipped.map((r) => toOrderCard(r, currencyCode)),
  }
}

// ---------------------------------------------------------------------------
// RecentActivity
// ---------------------------------------------------------------------------

function formatRelativeTime(unixSec: number, nowSec: number): string {
  const diff = nowSec - unixSec
  if (diff < 60) return 'just now'
  if (diff < 60 * 60) return `${Math.floor(diff / 60)} min ago`
  if (diff < 24 * 60 * 60) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / (24 * 60 * 60))
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface TimedEvent {
  ts: number
  entry: ActivityEntry
}

export function buildRecentActivity(
  receipts: EtsyReceipt[],
  lowStockProducts: Product[],
  nowSec: number,
  currencyCode: string
): ActivityEntry[] {
  const events: TimedEvent[] = []

  for (const r of receipts) {
    const placedTs = creationUnix(r)
    const refunded = isCanceled(r) && r.was_paid
    const amount = formatMoney(r.grandtotal, currencyCode)

    if (refunded) {
      events.push({
        ts: r.update_timestamp ?? placedTs,
        entry: {
          event: 'Refund processed',
          detail: `Order #${r.receipt_id} — ${amount}`,
          time: formatRelativeTime(r.update_timestamp ?? placedTs, nowSec),
          type: 'refund',
        },
      })
      continue
    }

    if (r.was_shipped) {
      events.push({
        ts: r.update_timestamp ?? placedTs,
        entry: {
          event: `Order #${r.receipt_id} shipped`,
          detail: amount,
          time: formatRelativeTime(r.update_timestamp ?? placedTs, nowSec),
          type: 'shipped',
        },
      })
    } else if (r.was_paid) {
      events.push({
        ts: placedTs,
        entry: {
          event: `Order #${r.receipt_id} placed`,
          detail: amount,
          time: formatRelativeTime(placedTs, nowSec),
          type: 'order',
        },
      })
    } else {
      events.push({
        ts: placedTs,
        entry: {
          event: `Order #${r.receipt_id} pending`,
          detail: amount,
          time: formatRelativeTime(placedTs, nowSec),
          type: 'processing',
        },
      })
    }
  }

  // Surface the most pressing low-stock item as an alert when relevant.
  const tightest = lowStockProducts[0]
  if (tightest) {
    events.push({
      ts: nowSec,
      entry: {
        event: 'Low stock alert',
        detail: `${tightest.name} — ${tightest.stock} remaining`,
        time: 'now',
        type: 'alert',
      },
    })
  }

  return events
    .sort((a, b) => b.ts - a.ts)
    .slice(0, RECENT_ACTIVITY_LIMIT)
    .map((e) => e.entry)
}

// ---------------------------------------------------------------------------
// RevenueByProduct
// ---------------------------------------------------------------------------

export function buildRevenueByProduct(args: {
  receipts: EtsyReceipt[]
  listings: EtsyListing[]
  sinceUnix: number
}): RevenueByProductEntry[] {
  const titleByListing = new Map<number, string>()
  for (const l of args.listings) titleByListing.set(l.listing_id, l.title)

  const unitsByListing = new Map<number, { units: number; divisor: number }>()
  for (const r of args.receipts) {
    if (creationUnix(r) < args.sinceUnix) continue
    if (isCanceled(r)) continue
    if (!r.was_paid) continue
    for (const t of r.transactions ?? []) {
      const prior = unitsByListing.get(t.listing_id)
      const units = lineTotalUnits(t)
      if (prior) {
        prior.units += units
      } else {
        unitsByListing.set(t.listing_id, { units, divisor: t.price.divisor || 100 })
      }
    }
  }

  const rows: RevenueByProductEntry[] = []
  for (const [listingId, agg] of unitsByListing) {
    rows.push({
      name: titleByListing.get(listingId) ?? `Listing ${listingId}`,
      value: agg.divisor > 0 ? agg.units / agg.divisor : agg.units,
    })
  }
  return rows
    .sort((a, b) => b.value - a.value)
    .slice(0, REVENUE_BY_PRODUCT_LIMIT)
}
