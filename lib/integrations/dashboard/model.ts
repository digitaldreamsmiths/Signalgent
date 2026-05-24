/**
 * Normalized cross-cutting dashboard shape.
 *
 * Aggregates a single "headline" from each mode's existing snapshot so
 * /dashboard widgets can display a unified view without each widget
 * reaching across all five integrations independently.
 *
 * Every section is nullable — null means "not connected" (or error /
 * not yet loaded). Widgets render fallback text in that case rather
 * than the mode-specific mock, because Dashboard isn't a single-provider
 * page — its truthfulness depends on transparency about what's wired.
 */

/** A pre-formatted relative time, e.g. "3m ago" / "1h ago" / "Yesterday". */
export type RelativeTime = string

export interface EmailsHeadline {
  /** Total unread messages in the inbox at snapshot time. */
  unread: number
}

export interface OrdersHeadline {
  /** Count of orders in the trailing 30-day window. */
  count: number
  /** Already-formatted shop-currency revenue, e.g. "$0.00". */
  revenue: string
}

export interface RevenueHeadline {
  /** Raw numeric amount in the snapshot's currency. */
  amount: number
  /** ISO currency code, e.g. "USD". */
  currency: string
  /** Display-ready string. */
  formatted: string
}

export interface VisitsHeadline {
  /** Display-ready count, e.g. "7,400 visits". */
  formatted: string
  /** Raw numeric count. */
  raw: number
  /** Display-ready percent change vs prior week, e.g. "+14%". */
  change: string
}

export interface SocialHeadline {
  /** True when a LinkedIn (or future social) account is connected. */
  connected: boolean
  /** Display name of the connected member, when known. */
  memberName: string | null
}

export interface RecentSignal {
  /** Which mode the signal came from — drives the dot color in LivePulse. */
  source: 'commerce' | 'communications' | 'finance' | 'analytics' | 'marketing'
  /** Short human-readable label, e.g. "Order #4069855475 placed". */
  label: string
  /** Pre-formatted relative time, e.g. "2d ago". */
  time: RelativeTime
}

export interface DashboardSnapshot {
  /** When this snapshot was assembled (ISO 8601). */
  generatedAt: string
  /** One headline per connected provider; null when that provider isn't connected. */
  headline: {
    emails: EmailsHeadline | null
    orders: OrdersHeadline | null
    revenue: RevenueHeadline | null
    visits: VisitsHeadline | null
    social: SocialHeadline | null
  }
  /** Total number of providers actively connected to this company. */
  activeConnectionsCount: number
  /** Recent cross-provider events, newest first. Capped at 5. */
  recentSignals: RecentSignal[]
}
