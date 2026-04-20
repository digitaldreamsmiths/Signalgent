/**
 * Raw Google Analytics 4 API access.
 *
 * Two endpoints are used:
 *   1. Admin API (`analyticsadmin.googleapis.com`):
 *      - `accountSummaries.list` to discover the user's GA4 properties
 *        during the OAuth callback, so we can auto-pick one.
 *   2. Data API (`analyticsdata.googleapis.com`):
 *      - `properties/{id}:runReport` for the metric + dimension reports
 *        that back every widget on /analytics.
 *
 * All calls take an already-fresh access token (the caller resolved any
 * refresh via `loadGoogleCredentials`). This module returns raw JSON
 * response shapes; normalization into the `AnalyticsSnapshot` happens in
 * `lib/integrations/ga/normalize.ts`.
 *
 * OAuth (authorize / code exchange / refresh / revoke) lives in
 * `lib/integrations/google/fetch.ts` — shared with Gmail.
 */

const GA_ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta'
const GA_DATA_API = 'https://analyticsdata.googleapis.com/v1beta'

/**
 * Scopes requested at authorization time. Keep in sync with Google Cloud
 * Console → Google Auth Platform → Data Access for this OAuth client.
 *
 * Only `analytics.readonly` is requested — grants read access to both the
 * Admin API (property metadata) and the Data API (reports). No OIDC scopes
 * like `userinfo.email` / `openid` / `email` are requested, so they don't
 * need to be mirrored in the consent screen.
 */
export const GA_SCOPES = 'https://www.googleapis.com/auth/analytics.readonly'

// ------------------------------------------------------------------
// Admin API — property discovery
// ------------------------------------------------------------------

export interface GAPropertySummary {
  /** `properties/123456789` — the exact shape every other API expects. */
  property: string
  displayName: string
  propertyType?: string
  parent?: string
}

export interface GAAccountSummary {
  name: string
  account: string
  displayName: string
  propertySummaries?: GAPropertySummary[]
}

export interface GAAccountSummariesResponse {
  accountSummaries?: GAAccountSummary[]
  nextPageToken?: string
}

/**
 * List every GA4 property the authenticated user has access to, grouped
 * by the GA account that owns them. Used once during the OAuth callback
 * to auto-pick a property.
 */
export async function listAccountSummaries(
  accessToken: string
): Promise<GAAccountSummariesResponse> {
  const res = await fetch(`${GA_ADMIN_API}/accountSummaries?pageSize=200`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`GA accountSummaries failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as GAAccountSummariesResponse
}

/**
 * Flatten the account-summaries tree into a plain list of
 * `{resourceName, displayName}`. Used to pick the first available
 * property at connect time.
 */
export function flattenProperties(
  resp: GAAccountSummariesResponse
): Array<{ resourceName: string; displayName: string }> {
  const out: Array<{ resourceName: string; displayName: string }> = []
  for (const account of resp.accountSummaries ?? []) {
    for (const prop of account.propertySummaries ?? []) {
      out.push({ resourceName: prop.property, displayName: prop.displayName })
    }
  }
  return out
}

// ------------------------------------------------------------------
// Data API — runReport
// ------------------------------------------------------------------

export interface GADateRange {
  startDate: string // 'YYYY-MM-DD' or relative like '7daysAgo'
  endDate: string
  name?: string
}

export interface GAMetric {
  name: string
  // expression, invisible, etc. not needed for our reports
}

export interface GADimension {
  name: string
}

export interface GAOrderBy {
  metric?: { metricName: string }
  dimension?: { dimensionName: string; orderType?: 'ALPHANUMERIC' | 'NUMERIC' }
  desc?: boolean
}

export interface GARunReportRequest {
  dateRanges: GADateRange[]
  metrics: GAMetric[]
  dimensions?: GADimension[]
  orderBys?: GAOrderBy[]
  limit?: string | number
  keepEmptyRows?: boolean
}

export interface GAMetricHeader {
  name: string
  type: string
}

export interface GADimensionHeader {
  name: string
}

export interface GARow {
  dimensionValues?: Array<{ value: string }>
  metricValues?: Array<{ value: string }>
}

export interface GARunReportResponse {
  dimensionHeaders?: GADimensionHeader[]
  metricHeaders?: GAMetricHeader[]
  rows?: GARow[]
  totals?: GARow[]
  rowCount?: number
  metadata?: Record<string, unknown>
}

/**
 * Run a GA4 Data API report.
 *
 * `propertyResourceName` is the full `properties/<id>` string — the same
 * shape we persist in the `connected_accounts.account_identifier` column.
 * The Data API expects the ID embedded in the URL path, so we slice off
 * the `properties/` prefix here.
 */
export async function runReport(args: {
  accessToken: string
  propertyResourceName: string
  request: GARunReportRequest
}): Promise<GARunReportResponse> {
  const id = args.propertyResourceName.replace(/^properties\//, '')
  const res = await fetch(`${GA_DATA_API}/properties/${id}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args.request),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`GA runReport failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as GARunReportResponse
}
