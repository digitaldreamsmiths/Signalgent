/**
 * Raw Etsy OAuth + Open API v3 access.
 *
 * Why this doesn't live under `lib/integrations/google/*`: Etsy uses
 * different auth and token endpoints, mandates PKCE on every flow,
 * rotates its refresh tokens, and requires a second header (`x-api-key`)
 * on every API call. Reusing the Google helpers would mean conditional
 * branches everywhere; keeping the Etsy primitives self-contained is
 * simpler and easier to audit.
 *
 * OAuth layout:
 *   Authorize:  https://www.etsy.com/oauth/connect
 *   Token:      https://api.etsy.com/v3/public/oauth/token
 *
 * PKCE is required. `generatePkce()` produces a verifier + S256
 * challenge; the verifier lives in a short-lived HTTP-only cookie
 * between connect and callback (see `./pkce-cookie.ts`).
 *
 * Access-token format is `{user_id}.{opaque}` — the numeric prefix is
 * the authenticated user's Etsy user ID, so we don't need a separate
 * `users/me` call at connect time.
 */

import { createHash, randomBytes } from 'crypto'

const ETSY_AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect'
const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token'
const ETSY_API_BASE = 'https://api.etsy.com/v3/application'

/**
 * Scopes requested at authorization time. Keep narrow — every scope
 * expands the consent screen and the blast radius of a leaked token.
 *
 * - `transactions_r` — read receipts (orders).
 * - `shops_r`        — read shop metadata (needed once at connect to
 *                      resolve shop_id + shop_name).
 */
export const ETSY_SCOPES = 'transactions_r shops_r'

function clientId(): string {
  const v = process.env.ETSY_CLIENT_ID
  if (!v) {
    throw new Error('ETSY_CLIENT_ID is not set. Get the keystring from your Etsy app settings.')
  }
  return v
}

function clientSecret(): string {
  const v = process.env.ETSY_CLIENT_SECRET
  if (!v) {
    throw new Error('ETSY_CLIENT_SECRET is not set. Get the shared secret from your Etsy app settings.')
  }
  return v
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

export interface PkcePair {
  codeVerifier: string
  codeChallenge: string
}

/**
 * Generate a PKCE verifier + S256 challenge. Verifier is 43 random
 * bytes base64url-encoded (meets the 43–128 char spec requirement).
 */
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
  const url = new URL(ETSY_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', args.redirectUri)
  url.searchParams.set('scope', args.scope ?? ETSY_SCOPES)
  url.searchParams.set('state', args.state)
  url.searchParams.set('code_challenge', args.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export interface EtsyTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string // 'Bearer'
}

export async function exchangeCode(args: {
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<EtsyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: args.redirectUri,
    code: args.code,
    code_verifier: args.codeVerifier,
  })
  const res = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Etsy token exchange failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as EtsyTokenResponse
}

/**
 * Refresh an Etsy access token.
 *
 * Etsy rotates refresh tokens on every refresh: the response contains
 * a new refresh_token that must replace the old one in storage.
 */
export async function refreshAccessToken(refreshToken: string): Promise<EtsyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
  })
  const res = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Etsy token refresh failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as EtsyTokenResponse
}

/**
 * Extract the Etsy user_id embedded in an access token. Tokens are
 * formatted as `{user_id}.{opaque}` — no extra API call required.
 */
export function extractUserIdFromToken(accessToken: string): string {
  const prefix = accessToken.split('.')[0]
  if (!prefix || !/^\d+$/.test(prefix)) {
    throw new Error('Etsy access token is not in the expected `{user_id}.{opaque}` format')
  }
  return prefix
}

// ---------------------------------------------------------------------------
// Open API v3 — typed helpers
// ---------------------------------------------------------------------------

export interface EtsyShop {
  shop_id: number
  shop_name: string
  user_id: number
  currency_code: string
  url?: string
  title?: string | null
  announcement?: string | null
  listing_active_count?: number
  digital_listing_count?: number
}

interface EtsyMoney {
  amount: number
  divisor: number
  currency_code: string
}

export interface EtsyReceipt {
  receipt_id: number
  receipt_type: number
  status: string // 'open' | 'paid' | 'completed' | 'payment processing' | 'canceled'
  was_paid: boolean
  was_shipped: boolean
  was_canceled?: boolean
  create_timestamp: number // unix seconds
  created_timestamp?: number // alias — Etsy uses both, defensively
  update_timestamp?: number
  grandtotal: EtsyMoney
  total_price?: EtsyMoney
}

interface EtsyReceiptsResponse {
  count: number
  results: EtsyReceipt[]
}

async function etsyApiGet<T>(args: {
  accessToken: string
  path: string
}): Promise<T> {
  // Etsy v3 requires x-api-key in the format `keystring:shared_secret`.
  // Confirmed live against openapi-ping — sending just the keystring
  // returns 403 "Shared secret is required in x-api-key header."
  const res = await fetch(`${ETSY_API_BASE}${args.path}`, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'x-api-key': `${clientId()}:${clientSecret()}`,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Etsy API ${args.path} failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as T
}

/**
 * Fetch the shop owned by a given Etsy user. Etsy enforces one shop
 * per user, so this returns a single object (not a list). Returns null
 * when the user has no shop (non-seller accounts get 404).
 */
export async function getUserShop(args: {
  accessToken: string
  userId: string
}): Promise<EtsyShop | null> {
  try {
    return await etsyApiGet<EtsyShop>({
      accessToken: args.accessToken,
      path: `/users/${encodeURIComponent(args.userId)}/shops`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes(' (404)')) return null
    throw err
  }
}

export interface ListReceiptsArgs {
  accessToken: string
  shopId: number
  /** Unix seconds — only include receipts created at or after this. */
  minCreated?: number
  /** Max per page (Etsy caps at 100). */
  limit?: number
  /** Offset for paging. */
  offset?: number
}

export async function listShopReceipts(
  args: ListReceiptsArgs
): Promise<EtsyReceiptsResponse> {
  const params = new URLSearchParams()
  params.set('limit', String(args.limit ?? 100))
  if (args.offset) params.set('offset', String(args.offset))
  if (args.minCreated) params.set('min_created', String(args.minCreated))
  return etsyApiGet<EtsyReceiptsResponse>({
    accessToken: args.accessToken,
    path: `/shops/${args.shopId}/receipts?${params.toString()}`,
  })
}
