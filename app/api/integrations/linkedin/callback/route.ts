/**
 * GET /api/integrations/linkedin/callback
 *
 * LinkedIn redirects the browser here after OAuth. Validates state
 * signature + expiry, re-checks that the authenticated user still owns
 * the company, exchanges the code (confidential-client flow, no PKCE),
 * fetches OIDC userinfo, saves the encrypted token + identity, and
 * redirects to /marketing.
 *
 * Member-tier scopes (openid/profile/email) do not return a refresh
 * token. When the access token expires (~60 days) the user reconnects.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { verifyState, InvalidStateError } from '@/lib/integrations/oauth-state'
import {
  exchangeCode,
  getUserinfo,
} from '@/lib/integrations/linkedin/fetch'
import {
  saveLinkedInCredentials,
  LINKEDIN_SERVICE,
} from '@/lib/integrations/linkedin/tokens'

function redirectToMarketing(
  origin: string,
  params: Record<string, string>
): NextResponse {
  const url = new URL('/settings/connections', origin)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const linkedinError = searchParams.get('error')
  const linkedinErrorDesc = searchParams.get('error_description')

  if (linkedinError) {
    return redirectToMarketing(origin, {
      integration: 'linkedin',
      status: 'cancelled',
      reason: linkedinErrorDesc ?? linkedinError,
    })
  }

  if (!code || !stateParam) {
    return redirectToMarketing(origin, {
      integration: 'linkedin',
      status: 'error',
      reason: 'Missing code or state',
    })
  }

  let payload
  try {
    payload = verifyState(stateParam)
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return redirectToMarketing(origin, {
        integration: 'linkedin',
        status: 'error',
        reason: err.message,
      })
    }
    throw err
  }
  if (payload.service !== LINKEDIN_SERVICE) {
    return redirectToMarketing(origin, {
      integration: 'linkedin',
      status: 'error',
      reason: 'State service mismatch',
    })
  }

  let access
  try {
    access = await requireCompanyAccess(payload.companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return redirectToMarketing(origin, {
        integration: 'linkedin',
        status: 'error',
        reason: err.message,
      })
    }
    throw err
  }
  if (access.userId !== payload.userId) {
    return redirectToMarketing(origin, {
      integration: 'linkedin',
      status: 'error',
      reason: 'User mismatch on callback',
    })
  }

  const redirectUri = new URL(
    '/api/integrations/linkedin/callback',
    origin
  ).toString()

  let tokens
  try {
    tokens = await exchangeCode({ code, redirectUri })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token exchange failed'
    return redirectToMarketing(origin, {
      integration: 'linkedin',
      status: 'error',
      reason: msg,
    })
  }

  let displayName: string
  let memberSub: string
  let pictureUrl: string | null = null
  let email: string | null = null
  try {
    const info = await getUserinfo(tokens.access_token)
    memberSub = info.sub
    const composed = [info.given_name, info.family_name].filter(Boolean).join(' ')
    displayName = info.name || composed || 'LinkedIn member'
    pictureUrl = info.picture ?? null
    email = info.email ?? null
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Userinfo lookup failed'
    return redirectToMarketing(origin, {
      integration: 'linkedin',
      status: 'error',
      reason: msg,
    })
  }

  await saveLinkedInCredentials(access.companyId, {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    memberSub,
    displayName,
    pictureUrl,
    email,
    scope: tokens.scope ?? null,
  })

  return redirectToMarketing(origin, {
    integration: 'linkedin',
    status: 'connected',
  })
}
