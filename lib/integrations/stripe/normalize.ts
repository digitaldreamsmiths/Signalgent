/**
 * Stripe → FinanceSnapshot normalizer.
 *
 * Given a list of Stripe balance transactions (already fetched), produce a
 * FinanceSnapshot that the widgets can consume. All monetary amounts from
 * Stripe are in minor units (cents); we convert to major here so the model
 * is consistent across providers.
 *
 * Rules:
 *   - Revenue: balance_transactions with type='charge' and positive amount.
 *   - Refund:  type='refund' (negative amount, reduces revenue).
 *   - Fee:     each transaction carries a `fee` component; sum as outflow.
 *   - Payout:  type='payout' (movement of funds, not revenue).
 *
 * The kpis.expenses field is null here — Stripe is not the source of truth
 * for business expenses. QuickBooks or manual entry will fill this later.
 * Widgets must tolerate null and render a sensible fallback.
 */

import type {
  FinanceKpi,
  FinanceSnapshot,
  FinanceTransaction,
  FinanceWeeklyPoint,
} from '../finance/model'
import type { StripeBalanceTransaction } from './fetch'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

function minorToMajor(amount: number): number {
  // Stripe returns integer minor units. Use /100 for zero-decimal-currency
  // correctness we'd need a currency-aware table; USD is the v1 assumption.
  return Math.round(amount) / 100
}

function weekStartIso(unixSec: number): string {
  // Monday 00:00 UTC of the week containing the given timestamp.
  const d = new Date(unixSec * 1000)
  const day = d.getUTCDay() // 0 = Sun
  const diffToMonday = (day + 6) % 7
  d.setUTCDate(d.getUTCDate() - diffToMonday)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function categorize(tx: StripeBalanceTransaction): FinanceTransaction['category'] {
  switch (tx.type) {
    case 'charge':
      return 'revenue'
    case 'refund':
      return 'refund'
    case 'payout':
      return 'payout'
    case 'stripe_fee':
    case 'application_fee':
      return 'fee'
    default:
      return 'other'
  }
}

function describe(tx: StripeBalanceTransaction): string {
  if (tx.description) return tx.description
  return tx.type.replace(/_/g, ' ')
}

interface NormalizeInput {
  transactions: StripeBalanceTransaction[]
  currency: string
  now?: Date // override for testing
}

export function normalizeToSnapshot(input: NormalizeInput): FinanceSnapshot {
  const now = input.now ?? new Date()
  const currency = (input.currency || 'USD').toUpperCase()
  const txs = input.transactions

  // Convert all once.
  const normalizedTxs: FinanceTransaction[] = txs.map((tx) => ({
    id: tx.id,
    description: describe(tx),
    amount: minorToMajor(tx.amount),
    currency: tx.currency.toUpperCase(),
    category: categorize(tx),
    occurredAt: new Date(tx.created * 1000).toISOString(),
  }))

  // ---- Weekly revenue buckets (last 8 weeks, oldest first) ----
  const byWeek = new Map<string, number>()
  // Seed the 8 buckets so empty weeks show as zero rather than missing.
  for (let i = 7; i >= 0; i--) {
    const weekStart = weekStartIso(Math.floor((now.getTime() - i * WEEK_MS) / 1000))
    byWeek.set(weekStart, 0)
  }
  for (const tx of normalizedTxs) {
    if (tx.category !== 'revenue' && tx.category !== 'refund') continue
    const weekStart = weekStartIso(Math.floor(new Date(tx.occurredAt).getTime() / 1000))
    if (byWeek.has(weekStart)) {
      byWeek.set(weekStart, (byWeek.get(weekStart) ?? 0) + tx.amount)
    }
  }
  const revenueByWeek: FinanceWeeklyPoint[] = Array.from(byWeek.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([weekStart, amount]) => ({ weekStart, amount: Math.round(amount * 100) / 100 }))

  // ---- 30-day KPIs with change vs previous 30 ----
  const windowMs = 30 * DAY_MS
  const currentStart = now.getTime() - windowMs
  const previousStart = currentStart - windowMs

  let currentRevenue = 0
  let previousRevenue = 0
  let currentFees = 0
  for (const tx of normalizedTxs) {
    const t = new Date(tx.occurredAt).getTime()
    if (tx.category === 'revenue' || tx.category === 'refund') {
      if (t >= currentStart) currentRevenue += tx.amount
      else if (t >= previousStart) previousRevenue += tx.amount
    }
    if (tx.category === 'fee' && t >= currentStart) {
      currentFees += Math.abs(tx.amount)
    }
  }

  const revenue: FinanceKpi = {
    value: Math.round(currentRevenue * 100) / 100,
    changePercent: computeChangePercent(currentRevenue, previousRevenue),
  }
  // Expenses from Stripe means processor fees only — not a real P&L expenses
  // figure. Exposed as null so widgets don't mislead; a QuickBooks source
  // will fill this properly later.
  const expenses: FinanceKpi = { value: null, changePercent: null }
  const netProfit: FinanceKpi = {
    value: revenue.value !== null ? Math.round((revenue.value - currentFees) * 100) / 100 : null,
    changePercent: null,
  }
  const mrr: FinanceKpi = { value: null, changePercent: null }

  // ---- Recent transactions, newest first, capped ----
  const recent = [...normalizedTxs]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 20)

  return {
    currency,
    generatedAt: now.toISOString(),
    kpis: { revenue, expenses, netProfit, mrr },
    revenueByWeek,
    transactions: recent,
  }
}

function computeChangePercent(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return 0
    return null // can't meaningfully compare to zero baseline
  }
  return Math.round(((current - previous) / previous) * 100)
}
