/**
 * Raw Pinterest OAuth + v5 API access.
 *
 * Pinterest's v5 OAuth uses PKCE + HTTP Basic auth on the token
 * endpoint — distinct from LinkedIn (confidential-only, no PKCE) and
 * from Etsy (PKCE + client_secret in body). Pinterest specifically
 * requires:
 *   1. PKCE code_verifier in the token exchange body.
 *   2. Authorization: Basic base64(client_id:client_secret) header on
 *      the token endpoint (NOT client_secret in body).
 * Sending client_secret in the body returns a 400 from Pinterest's
 * docs (haven't tested both vs one, but the Basic-auth-only path is
 * what the docs prescribe).
 *
 * OAuth layout:
 *   Authorize:  https://www.pinterest.com/oauth/
 *   Token:      https://api.pinterest.com/v5/oauth/token
 *
 * Refresh tokens rotate on every refresh (same as Etsy). Access tokens
 * last ~30 days, refresh tokens last ~1 year.
 */

import { createHash, randomBytes } from 'crypto'

const PINTEREST_AUTHORIZE_URL = 'https://www.pinterest.com/oauth/'
const PINTEREST_TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token'
const PINTEREST_API_BASE = 'https://api.pinterest.com/v5'

/**
 * Scopes requested at authorization time. All are read-only and
 * universally available without app review.
 *
 * - `user_accounts:read` — /v5/user_account (identity, username, type).
 * - `pins:read`          — /v5/pins (list user's own pins).
 * - `boards:read`        — /v5/boards (list user's boards).
 */
export const PINTEREST_SCOPES = 'user_accounts:read,pins:read,boards:read'

function clientId(): string {
  const v = process.env.PINTEREST_CLIENT_ID
  if (!v) {
    throw new Error('PINTEREST_CLIENT_ID is not set. Get the App ID from your Pinterest app settings.')
  }
  return v
}

function clientSecret(): string {
  const v = process.env.PINTEREST_CLIENT_SECRET
  if (!v) {
    throw new Error('PINTEREST_CLIENT_SECRET is not set. Get the App Secret from your Pinterest app settings.')
  }
  return v
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')}`
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

export interface PkcePair {
  codeVerifier: string
  codeChallenge: string
}

export function generatePkce(): PkcePair {
  const verifierBuf = randomBytes(32)
  const codeVerifier = base64url(verifierBuf)
  const challengeBuf = createHash('sha256').update(codeVerifier).digest()
  const codeChallenge = base64url(challengeBuf)
  return { codeVerifier, codeChallenge }
}

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ---------------------------------------------------------------------------
// OAuth authorize + token exchange
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(args: {
  state: string
  redirectUri: string
  codeChallenge: string
  scope?: string
}): string {
  const url = new URL(PINTEREST_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', args.redirectUri)
  url.searchParams.set('scope', args.scope ?? PINTEREST_SCOPES)
  url.searchParams.set('state', args.state)
  url.searchParams.set('code_challenge', args.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export interface PinterestTokenResponse {
  access_token: string
  refresh_token: string
  /** Seconds until access_token expires. */
  expires_in: number
  /** Seconds until refresh_token expires (~1 year). */
  refresh_token_expires_in?: number
  scope?: string
  token_type?: string // 'bearer'
}

export async function exchangeCode(args: {
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<PinterestTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  })
  const res = await fetch(PINTEREST_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Pinterest token exchange failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as PinterestTokenResponse
}

/**
 * Refresh an access token. Pinterest rotates refresh tokens on every
 * refresh — the response contains a new refresh_token that must replace
 * the old one in storage (same convention as Etsy).
 */
export async function refreshAccessToken(refreshToken: string): Promise<PinterestTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: PINTEREST_SCOPES,
  })
  const res = await fetch(PINTEREST_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Pinterest token refresh failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as PinterestTokenResponse
}

// ---------------------------------------------------------------------------
// v5 API — typed helpers
// ---------------------------------------------------------------------------

export interface PinterestUserAccount {
  /** Stable account identifier (Pinterest's `id`). */
  id: string
  /** @username without the leading @. */
  username: string
  /** `'BUSINESS' | 'PINNER'` — Pinterest distinguishes business vs personal accounts. */
  account_type?: string
  profile_image?: string
  website_url?: string
  /** Account-level totals (Pinterest occasionally surfaces these on the user-account endpoint). */
  follower_count?: number
  following_count?: number
  board_count?: number
  pin_count?: number
}

interface PinterestPin {
  id: string
}

interface PinterestPinsResponse {
  items: PinterestPin[]
  bookmark?: string
}

async function pinterestApiGet<T>(args: {
  accessToken: string
  path: string
}): Promise<T> {
  const res = await fetch(`${PINTEREST_API_BASE}${args.path}`, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Pinterest API ${args.path} failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as T
}

export async function getUserAccount(accessToken: string): Promise<PinterestUserAccount> {
  return pinterestApiGet<PinterestUserAccount>({
    accessToken,
    path: '/user_account',
  })
}

/**
 * Count the user's own pins by paginating /v5/pins until exhausted or
 * the page cap is reached. Pinterest pages with a `bookmark` cursor.
 */
export async function countUserPins(args: {
  accessToken: string
  maxPages?: number
  pageSize?: number
}): Promise<number> {
  const maxPages = args.maxPages ?? 5
  const pageSize = args.pageSize ?? 100
  let bookmark: string | undefined
  let total = 0
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams()
    params.set('page_size', String(pageSize))
    if (bookmark) params.set('bookmark', bookmark)
    const { items, bookmark: nextBookmark } = await pinterestApiGet<PinterestPinsResponse>({
      accessToken: args.accessToken,
      path: `/pins?${params.toString()}`,
    })
    if (!items || items.length === 0) break
    total += items.length
    if (!nextBookmark) break
    bookmark = nextBookmark
  }
  return total
}

export interface UserAnalyticsArgs {
  accessToken: string
  /** YYYY-MM-DD. Pinterest expects ISO calendar dates, not timestamps. */
  startDate: string
  endDate: string
}

export interface PinterestAnalyticsMetricSummary {
  /** Pinterest returns the metrics keyed by metric_type strings. */
  [metric: string]: { summary?: number; daily_metrics?: Array<{ date: string; value?: number }> }
}

/**
 * GET /v5/user_account/analytics — account-level metrics for the
 * trailing window. We request totals (IMPRESSION, SAVE, PIN_CLICK,
 * ENGAGEMENT) and use the `summary` field; daily breakdown is
 * available for future widgets that need a trend line.
 */
export async function getUserAnalytics(
  args: UserAnalyticsArgs
): Promise<PinterestAnalyticsMetricSummary> {
  const params = new URLSearchParams()
  params.set('start_date', args.startDate)
  params.set('end_date', args.endDate)
  params.set('metric_types', 'IMPRESSION,SAVE,PIN_CLICK,ENGAGEMENT')
  return pinterestApiGet<PinterestAnalyticsMetricSummary>({
    accessToken: args.accessToken,
    path: `/user_account/analytics?${params.toString()}`,
  })
}
