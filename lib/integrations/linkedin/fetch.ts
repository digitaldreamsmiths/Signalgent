/**
 * Raw LinkedIn OAuth + identity API access.
 *
 * Why this doesn't live under `lib/integrations/google/*`: LinkedIn has
 * its own auth endpoints, distinct refresh-token semantics (not issued
 * for OIDC-only scopes), and the API hosts are different. Reusing the
 * Google helpers would mean conditional branches everywhere; keeping
 * the LinkedIn primitives self-contained is simpler and easier to audit.
 *
 * OAuth layout:
 *   Authorize:  https://www.linkedin.com/oauth/v2/authorization
 *   Token:      https://www.linkedin.com/oauth/v2/accessToken
 *   Userinfo:   https://api.linkedin.com/v2/userinfo  (OIDC)
 *
 * Confidential-client flow (no PKCE). LinkedIn rejects PKCE +
 * client_secret combined for confidential clients with
 * "invalid_client" at the token exchange — verified live during
 * Session 13's first connect attempt. The signed state token
 * (lib/integrations/oauth-state.ts) is sufficient CSRF protection.
 *
 * Tokens:
 *   - Member-tier scopes (openid/profile/email) return an access token
 *     with a ~60-day lifetime and NO refresh token. When the access
 *     token expires the user reconnects.
 *   - Marketing Developer Platform scopes (post sync, analytics) return
 *     a refresh token. Out of scope for v1 — wired in a follow-up
 *     session once the LinkedIn app is approved.
 */

const LINKEDIN_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const LINKEDIN_API_BASE = 'https://api.linkedin.com'

/**
 * Scopes requested at authorization time. These three are LinkedIn's
 * universally-available OIDC scopes — no Marketing Developer Platform
 * review required. They give us identity (name, picture, email) but not
 * post/share data. Widening scope to post/share endpoints requires
 * LinkedIn approval and is deferred to a follow-up session.
 */
export const LINKEDIN_SCOPES = 'openid profile email'

function clientId(): string {
  const v = process.env.LINKEDIN_CLIENT_ID
  if (!v) {
    throw new Error('LINKEDIN_CLIENT_ID is not set. Get the Client ID from your LinkedIn app settings.')
  }
  return v
}

function clientSecret(): string {
  const v = process.env.LINKEDIN_CLIENT_SECRET
  if (!v) {
    throw new Error('LINKEDIN_CLIENT_SECRET is not set. Get the Client Secret from your LinkedIn app settings.')
  }
  return v
}

// ---------------------------------------------------------------------------
// OAuth authorize + token exchange
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(args: {
  state: string
  redirectUri: string
  scope?: string
}): string {
  // LinkedIn rejects PKCE + client_secret combined for confidential
  // clients ("invalid_client: Client authentication failed" at the
  // token exchange). Confidential client flow without PKCE is what
  // LinkedIn's docs prescribe for server-side apps.
  const url = new URL(LINKEDIN_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', args.redirectUri)
  url.searchParams.set('scope', args.scope ?? LINKEDIN_SCOPES)
  url.searchParams.set('state', args.state)
  return url.toString()
}

export interface LinkedInTokenResponse {
  access_token: string
  expires_in: number
  scope?: string
  token_type?: string // 'Bearer'
  refresh_token?: string // only for Marketing Developer Platform scopes
  refresh_token_expires_in?: number
  id_token?: string // present when openid scope is granted
}

export async function exchangeCode(args: {
  code: string
  redirectUri: string
}): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: args.redirectUri,
    code: args.code,
  })
  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as LinkedInTokenResponse
}

// ---------------------------------------------------------------------------
// Userinfo (OIDC)
// ---------------------------------------------------------------------------

export interface LinkedInUserinfo {
  sub: string // stable LinkedIn member identifier
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  email?: string
  email_verified?: boolean
  locale?: { country?: string; language?: string }
}

/**
 * GET https://api.linkedin.com/v2/userinfo
 * Returns the standard OIDC userinfo claims for the signed-in member.
 * Requires the `profile` scope (and `email` for email_verified).
 */
export async function getUserinfo(accessToken: string): Promise<LinkedInUserinfo> {
  const res = await fetch(`${LINKEDIN_API_BASE}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`LinkedIn userinfo failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as LinkedInUserinfo
}
