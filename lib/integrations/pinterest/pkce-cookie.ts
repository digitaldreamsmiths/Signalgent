/**
 * PKCE verifier cookie helpers for Pinterest OAuth.
 *
 * Same shape as `lib/integrations/etsy/pkce-cookie.ts` — scoped to the
 * Pinterest callback path so a single browser can have concurrent
 * connect flows for different providers without cookie collisions.
 */

import { createHash } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

const COOKIE_PREFIX = 'pinterest_pkce_'
const MAX_AGE_SEC = 10 * 60

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
    path: '/api/integrations/pinterest',
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
    path: '/api/integrations/pinterest',
    maxAge: 0,
  })
}
