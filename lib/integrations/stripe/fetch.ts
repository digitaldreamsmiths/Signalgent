/**
 * Raw Stripe API access.
 *
 * Two kinds of calls live here:
 *   1. Connect OAuth token exchange / revoke (platform secret key).
 *   2. Data reads on behalf of a connected account (that account's access token).
 *
 * This module knows nothing about our DB. It takes credentials as args and
 * returns raw Stripe response objects. Normalization happens in
 * lib/integrations/stripe/normalize.ts.
 */

const STRIPE_API = 'https://api.stripe.com/v1'

function platformSecretKey(): string {
  const k = process.env.STRIPE_SECRET_KEY
  if (!k) {
    throw new Error('STRIPE_SECRET_KEY is not set. This is the platform secret for OAuth exchange.')
  }
  return k
}

function clientId(): string {
  const id = process.env.STRIPE_CLIENT_ID
  if (!id) {
    throw new Error('STRIPE_CLIENT_ID is not set. Get it from Stripe Dashboard > Settings > Connect.')
  }
  return id
}

/**
 * Build the Stripe Connect OAuth authorize URL. Callers pass the signed state
 * token from lib/integrations/oauth-state. The redirect_uri here must match
 * what is registered in the Stripe dashboard.
 */
export function buildAuthorizeUrl(args: { state: string; redirectUri: string }): string {
  const url = new URL('https://connect.stripe.com/oauth/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('scope', 'read_write')
  url.searchParams.set('state', args.state)
  url.searchParams.set('redirect_uri', args.redirectUri)
  return url.toString()
}

export interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  stripe_user_id: string
  scope?: string
  livemode: boolean
  token_type: string
}

/** Exchange an authorization code for access/refresh tokens. */
export async function exchangeCode(code: string): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
  })
  const res = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${platformSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Stripe OAuth exchange failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as OAuthTokenResponse
}

/** Revoke a Stripe Connect access grant. Best-effort. */
export async function deauthorize(stripeUserId: string): Promise<void> {
  const body = new URLSearchParams({
    client_id: clientId(),
    stripe_user_id: stripeUserId,
  })
  const res = await fetch('https://connect.stripe.com/oauth/deauthorize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${platformSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  // Stripe returns 200 on success. We don't throw on failure — the caller
  // proceeds with local cleanup regardless.
  if (!res.ok) {
    // Swallow but log shape for debuggability
    const text = await res.text().catch(() => '')
    console.warn(`Stripe deauthorize returned ${res.status}: ${text}`)
  }
}

// ------------------------------------------------------------------
// Data reads — called with a connected account's access token
// ------------------------------------------------------------------

export interface StripeBalanceTransaction {
  id: string
  amount: number
  currency: string
  net: number
  fee: number
  type: string // 'charge' | 'refund' | 'payout' | 'adjustment' | ...
  description: string | null
  created: number // unix seconds
  status: string
  reporting_category: string
}

export interface StripeListResponse<T> {
  object: 'list'
  data: T[]
  has_more: boolean
  url: string
}

/**
 * List balance transactions. This is the richest single source for finance
 * data — it includes charges, fees, refunds, and payouts already reconciled
 * by Stripe.
 *
 * `createdAfter` is unix seconds. Paginated with `limit` (max 100) and
 * `startingAfter`.
 */
export async function listBalanceTransactions(args: {
  accessToken: string
  createdAfter?: number
  limit?: number
  startingAfter?: string
}): Promise<StripeListResponse<StripeBalanceTransaction>> {
  const params = new URLSearchParams()
  params.set('limit', String(args.limit ?? 100))
  if (args.createdAfter) {
    params.set('created[gte]', String(args.createdAfter))
  }
  if (args.startingAfter) {
    params.set('starting_after', args.startingAfter)
  }

  const res = await fetch(`${STRIPE_API}/balance_transactions?${params}`, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Stripe listBalanceTransactions failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as StripeListResponse<StripeBalanceTransaction>
}

export interface StripeAccount {
  id: string
  business_profile: { name: string | null } | null
  email: string | null
  default_currency: string
}

/** Fetch the connected account's profile, primarily for labels and currency. */
export async function retrieveAccount(accessToken: string): Promise<StripeAccount> {
  const res = await fetch(`${STRIPE_API}/account`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Stripe retrieveAccount failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as StripeAccount
}
