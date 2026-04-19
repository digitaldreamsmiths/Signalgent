/**
 * GET /api/integrations/gmail/callback
 *
 * Google redirects the browser here after OAuth. Validates state signature
 * and expiry, re-checks that the authenticated user still owns the company,
 * exchanges the code, saves encrypted tokens, redirects to /communications.
 *
 * Idempotent on (company_id, service): a replayed callback with the same
 * state will upsert the same row.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { verifyState, InvalidStateError } from '@/lib/integrations/oauth-state'
import { exchangeCode, getGmailProfile } from '@/lib/integrations/gmail/fetch'
import { saveGmailCredentials, GMAIL_SERVICE } from '@/lib/integrations/gmail/tokens'
import { invalidateCommunicationsSnapshot } from '@/lib/integrations/gmail/snapshot'

function redirectToCommunications(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL('/communications', origin)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const googleError = searchParams.get('error')
  const googleErrorDesc = searchParams.get('error_description')

  // User cancelled or Google returned an error
  if (googleError) {
    return redirectToCommunications(origin, {
      integration: 'gmail',
      status: 'cancelled',
      reason: googleErrorDesc ?? googleError,
    })
  }

  if (!code || !stateParam) {
    return redirectToCommunications(origin, {
      integration: 'gmail',
      status: 'error',
      reason: 'Missing code or state',
    })
  }

  // 1. Verify state signature + expiry
  let payload
  try {
    payload = verifyState(stateParam)
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return redirectToCommunications(origin, {
        integration: 'gmail',
        status: 'error',
        reason: err.message,
      })
    }
    throw err
  }

  if (payload.service !== GMAIL_SERVICE) {
    return redirectToCommunications(origin, {
      integration: 'gmail',
      status: 'error',
      reason: 'State service mismatch',
    })
  }

  // 2. Re-verify the authenticated user still owns this company and matches
  //    the user embedded in the state (defence in depth against session
  //    swaps mid-flow).
  let access
  try {
    access = await requireCompanyAccess(payload.companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return redirectToCommunications(origin, {
        integration: 'gmail',
        status: 'error',
        reason: err.message,
      })
    }
    throw err
  }
  if (access.userId !== payload.userId) {
    return redirectToCommunications(origin, {
      integration: 'gmail',
      status: 'error',
      reason: 'User mismatch on callback',
    })
  }

  // 3. Exchange code for tokens. Redirect URI must exactly match what we
  //    used on the authorize step — Google validates it server-side.
  const redirectUri = new URL('/api/integrations/gmail/callback', origin).toString()
  let tokens
  try {
    tokens = await exchangeCode({ code, redirectUri })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token exchange failed'
    return redirectToCommunications(origin, {
      integration: 'gmail',
      status: 'error',
      reason: msg,
    })
  }

  // 4. Pull the authenticated email for the account label. Gmail's own
  //    users.getProfile returns emailAddress — saves us requesting the
  //    separate userinfo.email OIDC scope.
  let emailAddress: string
  try {
    const profile = await getGmailProfile(tokens.access_token)
    emailAddress = profile.emailAddress
  } catch {
    emailAddress = 'unknown'
  }

  // 5. Save encrypted + invalidate cache
  await saveGmailCredentials(access.companyId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope ?? null,
    emailAddress,
  })
  await invalidateCommunicationsSnapshot(access.companyId)

  return redirectToCommunications(origin, {
    integration: 'gmail',
    status: 'connected',
  })
}
