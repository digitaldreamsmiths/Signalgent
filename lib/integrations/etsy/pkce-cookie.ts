/**
 * PKCE verifier cookie helpers.
 *
 * Etsy mandates PKCE. We generate a code_verifier at connect time and
 * need it back at callback time to exchange the code. Our stateless
 * HMAC-signed state token can't carry the verifier (it's plaintext —
 * visible in URLs, logs, referrers), so we persist the verifier
 * separately in an HTTP-only, path-scoped cookie.
 *
 * Cookie-keying: callers derive a short fingerprint of the state token
 * via `stateCookieKey()` and use that as the cookie slot. Keeps the
 * cookie name bounded-length and lets connect + callback look up the
 * verifier using only the state token both sides already have.
 *
 * Lifecycle:
 *   connect  → writePkceCookie(response, stateCookieKey(state), verifier)
 *   callback → readPkceCookie(request, stateCookieKey(state))
 *   callback → clearPkceCookie(response, stateCookieKey(state))
 *              (always, even on failure, so replays can't reuse a verifier)
 */

import { createHash } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

const COOKIE_PREFIX = 'etsy_pkce_'
const MAX_AGE_SEC = 10 * 60 // matches state TTL

/**
 * Derive a compact cookie-safe key from the raw state token. 16 hex
 * chars (64 bits) of SHA-256 is collision-proof for a 10-minute window
 * while staying well under cookie-name length sanity limits.
 */
export function stateCookieKey(state: string): string {
  return createHash('sha256').update(state).digest('hex').slice(0, 16)
}

function cookieName(key: string): string {
  return `${COOKIE_PREFIX}${key}`
}

export function writePkceCookie(
  response: NextResponse,
  key: string,
  verifier: string
): void {
  response.cookies.set(cookieName(key), verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/integrations/etsy',
    maxAge: MAX_AGE_SEC,
  })
}

export function readPkceCookie(
  request: NextRequest,
  key: string
): string | null {
  return request.cookies.get(cookieName(key))?.value ?? null
}

export function clearPkceCookie(response: NextResponse, key: string): void {
  response.cookies.set(cookieName(key), '', {
    path: '/api/integrations/etsy',
    maxAge: 0,
  })
}
