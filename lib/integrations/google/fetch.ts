/**
 * Shared Google OAuth primitives.
 *
 * This module is scope-agnostic: it builds authorize URLs, exchanges codes,
 * refreshes access tokens, and revokes tokens for any Google product that
 * uses the standard OAuth 2.0 flow. Gmail and Google Analytics both go
 * through here — per-product scopes are passed in as a parameter.
 *
 * Credentials come from the `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
 * environment variables. One OAuth client in Google Cloud Console covers
 * multiple products — you just need to add every callback URL (one per
 * service) to its Authorized Redirect URIs list.
 *
 * This module knows nothing about our DB. Product-specific modules (e.g.
 * lib/integrations/gmail/tokens.ts, lib/integrations/ga/tokens.ts) combine
 * these primitives with encryption + persistence.
 */

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID
  if (!v) {
    throw new Error('GOOGLE_CLIENT_ID is not set. Get it from Google Cloud Console > APIs & Services > Credentials.')
  }
  return v
}

function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET
  if (!v) {
    throw new Error('GOOGLE_CLIENT_SECRET is not set. Get it from Google Cloud Console > APIs & Services > Credentials.')
  }
  return v
}

/**
 * Build a Google OAuth authorize URL.
 *
 * `access_type=offline` + `prompt=consent` are required to receive a
 * refresh token — Google only returns one on first consent, unless
 * prompt=consent forces re-issue.
 *
 * `scope` is space-separated. Keep per-product scope constants narrow —
 * each scope added to the list must also be mirrored in the consent
 * screen's Data Access configuration in Google Cloud Console, or Google
 * will refuse to return a token.
 */
export function buildAuthorizeUrl(args: {
  state: string
  redirectUri: string
  scope: string
}): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', args.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', args.scope)
  url.searchParams.set('state', args.state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  return url.toString()
}

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number // seconds
  scope: string
  token_type: string // 'Bearer'
  id_token?: string
}

/**
 * Exchange an authorization code for access + refresh tokens. The caller
 * passes the same redirectUri used on the authorize step; Google validates
 * it matches.
 */
export async function exchangeCode(args: {
  code: string
  redirectUri: string
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: args.code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: args.redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as GoogleTokenResponse
}

/**
 * Refresh an access token using a long-lived refresh token. Google access
 * tokens expire after ~1 hour; we refresh transparently whenever we detect
 * an about-to-expire token.
 *
 * Note: the response does NOT include a new refresh_token. The original
 * refresh token continues to work until explicitly revoked.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
  scope: string
  token_type: string
}> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${text}`)
  }
  return JSON.parse(text)
}

/**
 * Revoke a token at Google. Accepts either an access or refresh token.
 * Best-effort: callers proceed with local cleanup regardless of outcome.
 */
export async function revokeToken(token: string): Promise<void> {
  const res = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn(`Google revoke returned ${res.status}: ${text}`)
  }
}
