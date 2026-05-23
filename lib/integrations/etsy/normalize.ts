/**
 * Shape raw Etsy receipts into the `CommerceSnapshot.orderStats` tile.
 *
 * Widgets never see raw Etsy responses — they read the pre-formatted
 * strings produced here. Same pattern as `lib/integrations/ga/normalize.ts`.
 *
 * Conventions:
 *   - totalRevenue is formatted with a currency symbol derived from
 *     `currency_code`. No locale handling beyond the common ISO codes
 *     we care about; unknown codes fall back to the plain code string.
 *   - fulfillmentRate is "shipped / non-canceled" — a canceled order
 *     neither can ship nor is it an outstanding obligation.
 *   - A receipt counts as "new" when it's paid but not yet shipped
 *     (the seller's to-do list).
 */

import type { EtsyReceipt } from './fetch'
import type { OrderStats } from '../commerce/model'

function isCanceled(r: EtsyReceipt): boolean {
  if (r.was_canceled) return true
  return r.status.toLowerCase() === 'canceled'
}

function creationUnix(r: EtsyReceipt): number {
  return r.create_timestamp ?? r.created_timestamp ?? 0
}

function formatCurrency(rawUnits: number, divisor: number, code: string): string {
  const value = divisor > 0 ? rawUnits / divisor : rawUnits
  const symbol = CURRENCY_SYMBOLS[code] ?? ''
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return symbol ? `${symbol}${formatted}` : `${formatted} ${code}`
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  CAD: '$',
  AUD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
}

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
  const processingOrders = newOrders // same Etsy bucket; widget surfaces both labels separately

  const paidReceipts = nonCanceled.filter((r) => r.was_paid)
  const revenueUnits = paidReceipts.reduce((acc, r) => acc + r.grandtotal.amount, 0)
  const divisor = paidReceipts[0]?.grandtotal.divisor ?? 100
  const totalRevenue = formatCurrency(revenueUnits, divisor, args.currencyCode)

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
