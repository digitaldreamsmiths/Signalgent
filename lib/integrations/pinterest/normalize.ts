/**
 * Shape Pinterest user account + analytics into the MarketingSnapshot.
 *
 * Widgets read pre-formatted strings (engagement rate as a percent
 * string) — same convention as the other normalizers in the codebase.
 */

import type { PinterestAnalyticsMetricSummary, PinterestUserAccount } from './fetch'
import type { MarketingKpis } from '../marketing/model'

export interface BuildKpisArgs {
  account: PinterestUserAccount
  analytics: PinterestAnalyticsMetricSummary
  publishedPins: number
}

function summary(analytics: PinterestAnalyticsMetricSummary, metric: string): number {
  const m = analytics[metric]
  if (!m || typeof m.summary !== 'number') return 0
  return m.summary
}

export function buildMarketingKpis(args: BuildKpisArgs): MarketingKpis {
  const impressions = summary(args.analytics, 'IMPRESSION')
  const engagements = summary(args.analytics, 'ENGAGEMENT')

  const avgReach =
    args.publishedPins > 0 ? Math.round(impressions / args.publishedPins) : 0

  const engagementRate =
    impressions > 0
      ? `${((engagements / impressions) * 100).toFixed(1)}%`
      : '—'

  return {
    scheduledPosts: null, // Pinterest doesn't expose scheduled pins via public API
    publishedPosts: args.publishedPins,
    avgReach,
    engagementRate,
  }
}
