/**
 * Normalized marketing data shape.
 *
 * Widgets read this, never raw provider responses. Provider-specific
 * normalizers (e.g. `lib/integrations/pinterest/normalize.ts`) build
 * a `MarketingSnapshot` from whatever shape the provider returns.
 *
 * V1 populates the headline `kpis` tile from Pinterest. The other
 * marketing widgets (ContentCalendar, PlatformBreakdown, EngagementTrend,
 * RecentPosts) continue reading `MARKETING_MOCK` until follow-up
 * sessions expand the snapshot with daily metrics + recent pins.
 */

export interface MarketingKpis {
  /**
   * Pinterest's public API doesn't expose scheduled pins, so this is
   * null when only Pinterest is connected. LinkedIn / other future
   * providers may populate it.
   */
  scheduledPosts: number | null
  /** Count of the user's own pins (or posts, when LinkedIn fills it). */
  publishedPosts: number
  /** Average impressions per published item over the trailing window. */
  avgReach: number
  /** Display-ready engagement rate, e.g. "4.2%" or "—" when undefined. */
  engagementRate: string
}

export interface MarketingSnapshot {
  /** ISO 8601 when this snapshot was computed. */
  generatedAt: string
  /** Identifies which provider currently feeds the snapshot. */
  provider: {
    /** Pinterest user id (or future provider id). */
    id: string
    /** Display name — Pinterest username, LinkedIn member name, etc. */
    name: string
    /** Provider-specific account-type hint (e.g. Pinterest 'BUSINESS' vs 'PINNER'). */
    accountType?: string | null
  }
  /** Headline KPIs that drive the `MarketingKpiRow` widget. */
  kpis: MarketingKpis
}
