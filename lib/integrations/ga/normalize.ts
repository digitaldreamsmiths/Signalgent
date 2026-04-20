/**
 * GA4 raw reports → AnalyticsSnapshot.
 *
 * The snapshot pipeline (`lib/integrations/ga/snapshot.ts`) fires multiple
 * `runReport` calls in parallel — one per widget shape — and passes the
 * responses here to be joined into a single `AnalyticsSnapshot`.
 *
 * GA4 returns:
 *   - metric values as strings ("1234", "0.42") — need parseFloat.
 *   - `bounceRate` and `engagementRate` as 0-1 ratios, not 0-100 percents.
 *     We convert once here and widgets can assume 0-100 throughout.
 *   - dates as `YYYYMMDD` strings in the `date` dimension — we turn into
 *     weekday labels so the widget doesn't have to know the date format.
 *   - `averageSessionDuration` in seconds — formatted as "2m 14s" here.
 *
 * Everything else is shape-wrangling. Per-metric presence is defensive:
 * if a report came back empty or partial, we emit null values the model
 * allows, and the widgets fall back to mock.
 */

import type {
  AnalyticsSnapshot,
  DailyDatum,
  MetricWithDelta,
  ReferralDatum,
  TopPageDatum,
} from '../analytics/model'
import type { GARow, GARunReportResponse } from './fetch'

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parseMetric(row: GARow | undefined, idx = 0): number {
  const v = row?.metricValues?.[idx]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function parseDimension(row: GARow | undefined, idx = 0): string {
  return row?.dimensionValues?.[idx]?.value ?? ''
}

/** GA4 returns `YYYYMMDD`; convert to a three-letter weekday label. */
function dateKeyToWeekday(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return ''
  const year = Number(yyyymmdd.slice(0, 4))
  const month = Number(yyyymmdd.slice(4, 6)) - 1
  const day = Number(yyyymmdd.slice(6, 8))
  const d = new Date(Date.UTC(year, month, day))
  return WEEKDAY_SHORT[d.getUTCDay()] ?? ''
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

function formatPct(n: number): string {
  // n already in 0-100.
  const rounded = Math.round(n * 10) / 10
  return `${rounded}%`
}

function formatChangePct(current: number, previous: number): string {
  if (previous === 0) {
    if (current === 0) return '0%'
    return '+\u221e' // only happens when we're dividing by a zero-sum prior week
  }
  const change = ((current - previous) / previous) * 100
  const rounded = Math.round(change)
  if (rounded === 0) return '0%'
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

function formatChangePctAbs(currentPct: number, previousPct: number): string {
  // "+0.4%" style — for rates that are themselves percents, subtract and
  // tack on the sign.
  const diff = currentPct - previousPct
  const rounded = Math.round(diff * 10) / 10
  if (rounded === 0) return '0%'
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function formatDurationDelta(currentSec: number, previousSec: number): string {
  const diff = Math.round(currentSec - previousSec)
  if (diff === 0) return '+0s'
  const abs = Math.abs(diff)
  return `${diff > 0 ? '+' : '-'}${abs}s`
}

// ------------------------------------------------------------------
// Per-report extractors
// ------------------------------------------------------------------

/** Traffic by day — dimensions: ['date'], metrics: ['sessions']. */
export function extractDailySessions(resp: GARunReportResponse): DailyDatum[] {
  const rows = resp.rows ?? []
  // GA4 returns rows in an unspecified order even when one date range is
  // asked for; sort by the raw `date` dimension so widget bars always
  // render chronologically.
  const sorted = [...rows].sort((a, b) =>
    parseDimension(a).localeCompare(parseDimension(b))
  )
  return sorted.map((r) => ({
    day: dateKeyToWeekday(parseDimension(r)),
    value: parseMetric(r, 0),
  }))
}

/** Engagement by day — dimensions: ['date'], metrics: ['eventCount']. Engagement is normalized as events-per-session = eventCount / sessions where possible; we request both metrics so we can divide. */
export function extractDailyEngagement(resp: GARunReportResponse): DailyDatum[] {
  const rows = resp.rows ?? []
  const sorted = [...rows].sort((a, b) =>
    parseDimension(a).localeCompare(parseDimension(b))
  )
  return sorted.map((r) => {
    const events = parseMetric(r, 0)
    const sessions = parseMetric(r, 1)
    return {
      day: dateKeyToWeekday(parseDimension(r)),
      value: sessions > 0 ? Math.round((events / sessions) * 10) / 10 : 0,
    }
  })
}

/** Bounce rate by day — dimensions: ['date'], metrics: ['bounceRate']. bounceRate is 0-1, convert to 0-100. */
export function extractDailyBounceRate(
  resp: GARunReportResponse
): Array<{ day: string; rate: number }> {
  const rows = resp.rows ?? []
  const sorted = [...rows].sort((a, b) =>
    parseDimension(a).localeCompare(parseDimension(b))
  )
  return sorted.map((r) => ({
    day: dateKeyToWeekday(parseDimension(r)),
    rate: Math.round(parseMetric(r, 0) * 1000) / 10, // 1-digit percent
  }))
}

/** Top pages — dimensions: ['pagePath'], metrics: ['screenPageViews'], orderBy desc on views, limit 5. */
export function extractTopPages(resp: GARunReportResponse): TopPageDatum[] {
  const rows = (resp.rows ?? []).slice(0, 5)
  if (rows.length === 0) return []
  const topViews = parseMetric(rows[0], 0)
  return rows.map((r) => {
    const views = parseMetric(r, 0)
    return {
      path: parseDimension(r) || '(unknown)',
      views,
      pct: topViews > 0 ? Math.round((views / topViews) * 100) : 0,
    }
  })
}

/** Top referrals — dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions'], orderBy desc, limit 6. */
export function extractReferralSources(resp: GARunReportResponse): ReferralDatum[] {
  const rows = (resp.rows ?? []).slice(0, 6)
  return rows.map((r) => ({
    source: parseDimension(r) || '(unknown)',
    value: parseMetric(r, 0),
  }))
}

/**
 * Aggregate metrics for this-week / last-week comparison.
 * Dimensions: none, metrics: ['sessions', 'conversions', 'bounceRate',
 * 'averageSessionDuration'], dateRanges: [this week, last week].
 *
 * GA4 runs one report per date range and merges them into `rows` with a
 * `dateRange` dimension — we request it via `dimensions: []` plus
 * `dateRanges: [A, B]`, which yields two totals rows keyed by
 * `dateRange` dimension (`date_range_0`, `date_range_1`).
 *
 * For simplicity we call this method twice — once for each range — and
 * pair them here, to avoid special-case dimension parsing.
 */
export function buildHeadlineMetrics(
  current: GARunReportResponse,
  previous: GARunReportResponse
): {
  totalTraffic: MetricWithDelta
  conversionRate: MetricWithDelta
  bounceRate: MetricWithDelta
  avgSession: MetricWithDelta
} {
  const cur = current.rows?.[0]
  const prev = previous.rows?.[0]

  const curSessions = parseMetric(cur, 0)
  const prevSessions = parseMetric(prev, 0)
  const curConversions = parseMetric(cur, 1)
  const prevConversions = parseMetric(prev, 1)
  const curBounce = parseMetric(cur, 2) * 100 // 0-1 → 0-100
  const prevBounce = parseMetric(prev, 2) * 100
  const curAvgSec = parseMetric(cur, 3)
  const prevAvgSec = parseMetric(prev, 3)

  const curConversionPct = curSessions > 0 ? (curConversions / curSessions) * 100 : 0
  const prevConversionPct = prevSessions > 0 ? (prevConversions / prevSessions) * 100 : 0

  return {
    totalTraffic: {
      value: `${formatNumber(curSessions)} visits`,
      previous: `${formatNumber(prevSessions)} visits`,
      change: formatChangePct(curSessions, prevSessions),
      rawValue: curSessions,
    },
    conversionRate: {
      value: formatPct(curConversionPct),
      previous: formatPct(prevConversionPct),
      change: formatChangePctAbs(curConversionPct, prevConversionPct),
      rawValue: curConversionPct,
    },
    bounceRate: {
      value: formatPct(curBounce),
      previous: formatPct(prevBounce),
      change: formatChangePctAbs(curBounce, prevBounce),
      rawValue: curBounce,
    },
    avgSession: {
      value: formatDuration(curAvgSec),
      previous: formatDuration(prevAvgSec),
      change: formatDurationDelta(curAvgSec, prevAvgSec),
      rawValue: curAvgSec,
    },
  }
}

// ------------------------------------------------------------------
// Compose
// ------------------------------------------------------------------

export interface AssembleInput {
  propertyResourceName: string
  propertyDisplayName: string | null
  dailyTraffic: GARunReportResponse
  dailyEngagement: GARunReportResponse
  dailyBounce: GARunReportResponse
  topPages: GARunReportResponse
  referrals: GARunReportResponse
  headlineCurrent: GARunReportResponse
  headlinePrevious: GARunReportResponse
  now?: Date
}

export function assembleSnapshot(input: AssembleInput): AnalyticsSnapshot {
  const headline = buildHeadlineMetrics(input.headlineCurrent, input.headlinePrevious)
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    property: {
      resourceName: input.propertyResourceName,
      displayName: input.propertyDisplayName,
    },
    trafficBars: extractDailySessions(input.dailyTraffic),
    engagementBars: extractDailyEngagement(input.dailyEngagement),
    bounceTrend: extractDailyBounceRate(input.dailyBounce),
    topPages: extractTopPages(input.topPages),
    referralSources: extractReferralSources(input.referrals),
    ...headline,
  }
}
