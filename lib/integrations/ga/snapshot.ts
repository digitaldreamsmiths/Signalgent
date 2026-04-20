/**
 * GA4 analytics snapshot orchestration.
 *
 * Single entry point that server actions + the analytics snapshot context
 * call to get a live `AnalyticsSnapshot` for a company. Composes
 * creds + fetch + normalize + cache + status updates.
 *
 * Returns null when the company has no connected GA4 account (widgets
 * fall back to mock). Any provider error is caught, flagged on the account
 * row, and returned as null so the UI degrades cleanly.
 */

import { cache } from '../cache'
import { markSynced } from '../accounts'
import type { AnalyticsSnapshot } from '../analytics/model'
import { runReport, type GARunReportRequest } from './fetch'
import { assembleSnapshot } from './normalize'
import {
  GOOGLE_ANALYTICS_SERVICE,
  getGoogleAnalyticsAccountRow,
  loadGoogleAnalyticsCredentials,
  markGoogleAnalyticsError,
} from './tokens'

const SNAPSHOT_TTL_SEC = 5 * 60 // 5 minutes — GA data updates slowly

function snapshotKey(companyId: string): string {
  return `ga:snapshot:${companyId}`
}

// ----- report request builders -----------------------------------------

const TODAY = 'today'

function dailyTrafficReq(): GARunReportRequest {
  return {
    dateRanges: [{ startDate: '7daysAgo', endDate: TODAY }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ dimension: { dimensionName: 'date', orderType: 'ALPHANUMERIC' } }],
    limit: 7,
  }
}

function dailyEngagementReq(): GARunReportRequest {
  return {
    dateRanges: [{ startDate: '7daysAgo', endDate: TODAY }],
    dimensions: [{ name: 'date' }],
    // Two metrics — we divide to get events-per-session in normalize.ts.
    metrics: [{ name: 'eventCount' }, { name: 'sessions' }],
    orderBys: [{ dimension: { dimensionName: 'date', orderType: 'ALPHANUMERIC' } }],
    limit: 7,
  }
}

function dailyBounceReq(): GARunReportRequest {
  return {
    dateRanges: [{ startDate: '7daysAgo', endDate: TODAY }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'bounceRate' }],
    orderBys: [{ dimension: { dimensionName: 'date', orderType: 'ALPHANUMERIC' } }],
    limit: 7,
  }
}

function topPagesReq(): GARunReportRequest {
  return {
    dateRanges: [{ startDate: '7daysAgo', endDate: TODAY }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 5,
  }
}

function referralsReq(): GARunReportRequest {
  return {
    dateRanges: [{ startDate: '7daysAgo', endDate: TODAY }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 6,
  }
}

/**
 * Headline metrics, one per date range. We fire this twice — once for
 * the current week, once for the prior — so the normalizer can diff
 * the two totals. Keeps the response shape flat (single-row totals)
 * and avoids special-casing a `dateRange` dimension column.
 */
function headlineReq(startDate: string, endDate: string): GARunReportRequest {
  return {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'sessions' },
      { name: 'conversions' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
  }
}

// ----- snapshot entry point --------------------------------------------

export async function getAnalyticsSnapshot(
  companyId: string
): Promise<AnalyticsSnapshot | null> {
  // 1. Cache hit?
  const cached = await cache.get<AnalyticsSnapshot>(snapshotKey(companyId))
  if (cached) return cached

  // 2. Credentials?
  const creds = await loadGoogleAnalyticsCredentials(companyId)
  if (!creds) return null

  // 3. Display name comes from the account row's label (captured at
  //    connect time). Nothing cached in the token load, so read the row
  //    directly — same call the connection chip makes.
  const row = await getGoogleAnalyticsAccountRow(companyId)
  const propertyDisplayName = row?.account_label ?? null

  // 4. Fire every report in parallel. If any one fails, we catch + mark
  //    error + return null; widgets fall back to mock across the board.
  try {
    const { accessToken, propertyResourceName } = creds
    const common = { accessToken, propertyResourceName }

    const [
      dailyTraffic,
      dailyEngagement,
      dailyBounce,
      topPages,
      referrals,
      headlineCurrent,
      headlinePrevious,
    ] = await Promise.all([
      runReport({ ...common, request: dailyTrafficReq() }),
      runReport({ ...common, request: dailyEngagementReq() }),
      runReport({ ...common, request: dailyBounceReq() }),
      runReport({ ...common, request: topPagesReq() }),
      runReport({ ...common, request: referralsReq() }),
      runReport({ ...common, request: headlineReq('7daysAgo', TODAY) }),
      runReport({ ...common, request: headlineReq('14daysAgo', '8daysAgo') }),
    ])

    const snapshot = assembleSnapshot({
      propertyResourceName,
      propertyDisplayName,
      dailyTraffic,
      dailyEngagement,
      dailyBounce,
      topPages,
      referrals,
      headlineCurrent,
      headlinePrevious,
    })

    await cache.set(snapshotKey(companyId), snapshot, SNAPSHOT_TTL_SEC)
    await markSynced(companyId, GOOGLE_ANALYTICS_SERVICE)
    return snapshot
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markGoogleAnalyticsError(companyId, msg)
    return null
  }
}

export async function invalidateAnalyticsSnapshot(companyId: string): Promise<void> {
  await cache.invalidate(`ga:snapshot:${companyId}`)
}
