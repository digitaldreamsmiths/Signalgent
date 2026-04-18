/**
 * Normalized finance data shape.
 *
 * Widgets read this, never raw provider responses. Provider-specific
 * normalizers (e.g. lib/integrations/stripe/normalize.ts) build a
 * FinanceSnapshot from whatever shape the provider returns.
 *
 * A FinanceSnapshot always has the same fields regardless of provider.
 * When a field cannot be derived for a given provider, it is set to null
 * and widgets render a graceful fallback. MockData also conforms to this
 * shape so mock vs live is a single switch, not a data-shape divergence.
 */

export interface FinanceTransaction {
  id: string
  description: string
  /** Positive = inflow (revenue, refund-in), negative = outflow (refund-out, fee). */
  amount: number
  /** ISO currency code, e.g. 'USD'. */
  currency: string
  /** Broad category. For Stripe this is derived; for accounting tools it is explicit. */
  category: 'revenue' | 'fee' | 'refund' | 'payout' | 'expense' | 'other'
  /** ISO 8601 timestamp. */
  occurredAt: string
}

export interface FinanceWeeklyPoint {
  /** ISO 8601 date (Monday of the week). */
  weekStart: string
  /** Sum for the week in the snapshot's currency. */
  amount: number
}

export interface FinanceKpi {
  /** Numeric value in the snapshot's currency. null when not derivable. */
  value: number | null
  /** Percent change vs. previous equal-length period. null when not derivable. */
  changePercent: number | null
}

export interface FinanceSnapshot {
  /** ISO currency code the snapshot is denominated in. */
  currency: string
  /** When this snapshot was computed. */
  generatedAt: string
  /** Headline KPIs for the last 30 days. */
  kpis: {
    revenue: FinanceKpi
    expenses: FinanceKpi
    netProfit: FinanceKpi
    mrr: FinanceKpi
  }
  /** Revenue sums per week for the last 8 weeks (oldest first). */
  revenueByWeek: FinanceWeeklyPoint[]
  /** Most recent transactions, newest first. Capped by the normalizer. */
  transactions: FinanceTransaction[]
}
