/**
 * Dashboard snapshot orchestration.
 *
 * Aggregates a single "headline" from each mode's existing snapshot.
 * All four per-mode snapshots are fetched in parallel via Promise.all
 * — they cache independently (5-min TTL per mode), so cross-mode reads
 * cost nothing when those modes have been recently viewed.
 *
 * Failures on one provider don't break the others: each section is
 * resolved with `Promise.allSettled`, and any fulfilled? false rejection
 * leaves that section as `null`. Widgets render an empty-state per
 * section rather than the whole dashboard blowing up.
 *
 * Recent signals are derived from CommerceSnapshot.recentActivity for
 * v1. Cross-provider signal aggregation (mixing email arrivals,
 * payments, etc.) is a future expansion — the field is in the model so
 * the shape is stable.
 */

import { getFinanceSnapshot } from '../stripe/snapshot'
import { getCommunicationsSnapshot } from '../gmail/snapshot'
import { getCommerceSnapshot } from '../etsy/snapshot'
import { getAnalyticsSnapshot } from '../ga/snapshot'
import { getLinkedInAccountRow } from '../linkedin/tokens'
import type { DashboardSnapshot, RecentSignal } from './model'

const MAX_SIGNALS = 5

export async function getDashboardSnapshot(
  companyId: string
): Promise<DashboardSnapshot> {
  const [financeRes, commsRes, commerceRes, analyticsRes, linkedinRes] =
    await Promise.allSettled([
      getFinanceSnapshot(companyId),
      getCommunicationsSnapshot(companyId),
      getCommerceSnapshot(companyId),
      getAnalyticsSnapshot(companyId),
      getLinkedInAccountRow(companyId),
    ])

  const finance = settled(financeRes)
  const comms = settled(commsRes)
  const commerce = settled(commerceRes)
  const analytics = settled(analyticsRes)
  const linkedinRow = settled(linkedinRes)

  const emails = comms
    ? { unread: comms.totalUnread }
    : null

  const orders = commerce
    ? {
        count: commerce.orderStats.totalOrders,
        revenue: commerce.orderStats.totalRevenue,
      }
    : null

  const revenue =
    finance && finance.kpis.revenue.value !== null
      ? {
          amount: finance.kpis.revenue.value,
          currency: finance.currency,
          formatted: formatCurrency(finance.kpis.revenue.value, finance.currency),
        }
      : null

  const visits = analytics
    ? {
        formatted: analytics.totalTraffic.value,
        raw: analytics.totalTraffic.rawValue,
        change: analytics.totalTraffic.change,
      }
    : null

  const social =
    linkedinRow && linkedinRow.status === 'connected'
      ? { connected: true, memberName: linkedinRow.account_label }
      : null

  const activeConnectionsCount = [
    emails,
    orders,
    revenue,
    visits,
    social,
  ].filter((x) => x !== null).length

  const recentSignals: RecentSignal[] =
    commerce?.recentActivity
      .slice(0, MAX_SIGNALS)
      .map((a) => ({
        source: 'commerce' as const,
        label: a.event,
        time: a.time,
      })) ?? []

  return {
    generatedAt: new Date().toISOString(),
    headline: { emails, orders, revenue, visits, social },
    activeConnectionsCount,
    recentSignals,
  }
}

function settled<T>(result: PromiseSettledResult<T | null>): T | null {
  if (result.status !== 'fulfilled') return null
  return result.value
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  CAD: '$',
  AUD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
}

function formatCurrency(value: number, code: string): string {
  const symbol = CURRENCY_SYMBOLS[code] ?? ''
  const isYen = code === 'JPY'
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: isYen ? 0 : 2,
    maximumFractionDigits: isYen ? 0 : 2,
  })
  return symbol ? `${symbol}${formatted}` : `${formatted} ${code}`
}
