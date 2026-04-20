/**
 * Normalized analytics data shape.
 *
 * Widgets read this, never raw provider responses. Provider-specific
 * normalizers (e.g. lib/integrations/ga/normalize.ts) build an
 * AnalyticsSnapshot from whatever shape the provider returns.
 *
 * A AnalyticsSnapshot always has the same fields regardless of provider.
 * When a field cannot be derived, it is set to null and widgets render a
 * graceful fallback (the existing ANALYTICS_MOCK). MockData also conforms
 * to this shape so mock vs live is a single switch, not a data-shape
 * divergence.
 */

/** One weekday bar (traffic + engagement charts). */
export interface DailyDatum {
  /** Three-letter weekday label, e.g. "Mon". Already in the owner's local order. */
  day: string
  /** Absolute value for the day — sessions for traffic, events-per-session for engagement. */
  value: number
}

/** One row in the top-pages widget. */
export interface TopPageDatum {
  path: string
  views: number
  /** 0-100, relative to the top row. */
  pct: number
}

/** One referral source row, for the ReferralSources widget. */
export interface ReferralDatum {
  source: string
  value: number
}

/** A metric that has a "now" value, a prior-period value for comparison, and a delta. */
export interface MetricWithDelta {
  /** Display-ready current-period value (already formatted, e.g. "3.8%" or "2m 14s"). */
  value: string
  /** Display-ready prior-period value. */
  previous: string
  /** Display-ready change string, e.g. "+14%" or "-3%". */
  change: string
  /** Raw current-period number — useful for widgets that need math on the value. */
  rawValue: number
}

export interface AnalyticsSnapshot {
  /** When this snapshot was computed. */
  generatedAt: string
  /** The GA4 property identifier — drives the connection chip label. */
  property: {
    /** `properties/123456789` */
    resourceName: string
    /** Human-readable display name from the Admin API (e.g. "My Business GA4"). */
    displayName: string | null
  }
  /** Trailing 7 days, one bar per day. Sessions. */
  trafficBars: DailyDatum[]
  /** Trailing 7 days, one bar per day. Events-per-session. */
  engagementBars: DailyDatum[]
  /** Trailing 7 days, one point per day. Bounce rate as a percent 0-100. */
  bounceTrend: Array<{ day: string; rate: number }>
  /** Top pages by views, last 7 days. Up to 5 rows. */
  topPages: TopPageDatum[]
  /** Top referral sources by sessions, last 7 days. Up to 6 rows. */
  referralSources: ReferralDatum[]

  /** Total visits this week vs last week. */
  totalTraffic: MetricWithDelta
  /** Conversion rate this week vs last week, percent 0-100. */
  conversionRate: MetricWithDelta
  /** Bounce rate this week vs last week, percent 0-100. */
  bounceRate: MetricWithDelta
  /** Average session duration this week vs last week. */
  avgSession: MetricWithDelta
}
