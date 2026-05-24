/**
 * GET /api/integrations/pinterest/callback
 *
 * Pinterest redirects the browser here after OAuth. Validates state +
 * ownership, recovers PKCE verifier, exchanges code, fetches the
 * user-account identity, saves the encrypted tokens + identity, and
 * redirects to /marketing.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { verifyState, InvalidStateError } from '@/lib/integrations/oauth-state'
import {
  exchangeCode,
  getUserAccount,
} from '@/lib/integrations/pinterest/fetch'
import {
  savePinterestCredentials,
  PINTEREST_SERVICE,
} from '@/lib/integrations/pinterest/tokens'
import { invalidateMarketingSnapshot } from '@/lib/integrations/pinterest/snapshot'
import {
  clearPkceCookie,
  readPkceCookie,
  stateCookieKey,
} from '@/lib/integrations/pinterest/pkce-cookie'

function redirectToMarketing(
  origin: string,
  params: Record<string, string>,
  cookieKeyToClear?: string
): NextResponse {
  const url = new URL('/marketing', origin)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const response = NextResponse.redirect(url)
  if (cookieKeyToClear) {
    clearPkceCookie(response, cookieKeyToClear)
  }
  return response
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const pinterestError = searchParams.get('error')
  const pinterestErrorDesc = searchParams.get('error_description')

  const cookieKey = stateParam ? stateCookieKey(stateParam) : undefined

  if (pinterestError) {
    return redirectToMarketing(
      origin,
      {
        integration: 'pinterest',
        status: 'cancelled',
        reason: pinterestErrorDesc ?? pinterestError,
      },
      cookieKey
    )
  }

  if (!code || !stateParam) {
    return redirectToMarketing(
      origin,
      { integration: 'pinterest', status: 'error', reason: 'Missing code or state' },
      cookieKey
    )
  }

  let payload
  try {
    payload = verifyState(stateParam)
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return redirectToMarketing(
        origin,
        { integration: 'pinterest', status: 'error', reason: err.message },
        cookieKey
      )
    }
    throw err
  }
  if (payload.service !== PINTEREST_SERVICE) {
    return redirectToMarketing(
      origin,
      { integration: 'pinterest', status: 'error', reason: 'State service mismatch' },
      cookieKey
    )
  }

  let access
  try {
    access = await requireCompanyAccess(payload.companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return redirectToMarketing(
        origin,
        { integration: 'pinterest', status: 'error', reason: err.message },
        cookieKey
      )
    }
    throw err
  }
  if (access.userId !== payload.userId) {
    return redirectToMarketing(
      origin,
      { integration: 'pinterest', status: 'error', reason: 'User mismatch on callback' },
      cookieKey
    )
  }

  const codeVerifier = cookieKey ? readPkceCookie(request, cookieKey) : null
  if (!codeVerifier) {
    return redirectToMarketing(
      origin,
      {
        integration: 'pinterest',
        status: 'error',
        reason: 'PKCE verifier missing — start the connect flow from /marketing',
      },
      cookieKey
    )
  }

  const redirectUri = new URL(
    '/api/integrations/pinterest/callback',
    origin
  ).toString()

  let tokens
  try {
    tokens = await exchangeCode({ code, redirectUri, codeVerifier })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token exchange failed'
    return redirectToMarketing(
      origin,
      { integration: 'pinterest', status: 'error', reason: msg },
      cookieKey
    )
  }

  let accountId: string
  let username: string
  let accountType: string | null = null
  let profileImage: string | null = null
  try {
    const acct = await getUserAccount(tokens.access_token)
    accountId = acct.id
    username = acct.username
    accountType = acct.account_type ?? null
    profileImage = acct.profile_image ?? null
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Account lookup failed'
    return redirectToMarketing(
      origin,
      { integration: 'pinterest', status: 'error', reason: msg },
      cookieKey
    )
  }

  await savePinterestCredentials(access.companyId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    accountId,
    username,
    accountType,
    profileImage,
    scope: tokens.scope ?? null,
  })
  await invalidateMarketingSnapshot(access.companyId)

  return redirectToMarketing(
    origin,
    { integration: 'pinterest', status: 'connected' },
    cookieKey
  )
}
