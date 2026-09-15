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
import { gmailConnectionError } from '@/lib/integrations/gmail/connection-errors'

function redirectToCommunications(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL('/connections', origin)
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

  // User cancelled or Google returned an error
  if (googleError) {
    return redirectToCommunications(origin, {
      integration: 'gmail',
      status: 'cancelled',
      reason: 'cancelled',
    })
  }

  if (!code || !stateParam) {
    return redirectToCommunications(origin, {
      integration: 'gmail',
      status: 'error',
      reason: 'invalid_state',
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
        reason: 'invalid_state',
      })
    }
    return redirectToCommunications(origin, { integration: 'gmail', status: 'error', reason: gmailConnectionError(err, 'invalid_state') })
  }

  if (payload.service !== GMAIL_SERVICE) {
    return redirectToCommunications(origin, {
      integration: 'gmail',
      status: 'error',
      reason: 'invalid_state',
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
        reason: 'unauthorized',
      })
    }
    return redirectToCommunications(origin, { integration: 'gmail', status: 'error', reason: 'unauthorized' })
  }
  if (access.userId !== payload.userId) {
    return redirectToCommunications(origin, {
      integration: 'gmail',
      status: 'error',
      reason: 'unauthorized',
    })
  }

  // 3. Exchange code for tokens. Redirect URI must exactly match what we
  //    used on the authorize step — Google validates it server-side.
  const redirectUri = new URL('/api/integrations/gmail/callback', origin).toString()
  let tokens
  try {
    tokens = await exchangeCode({ code, redirectUri })
  } catch (err) {
    return redirectToCommunications(origin, {
      integration: 'gmail',
      status: 'error',
      reason: gmailConnectionError(err, 'exchange'),
    })
  }

  // 4. Pull the authenticated email for the account label. Gmail's own
  //    users.getProfile returns emailAddress — saves us requesting the
  //    separate userinfo.email OIDC scope.
  let emailAddress: string
  try {
    const profile = await getGmailProfile(tokens.access_token)
    emailAddress = profile.emailAddress
    if (!emailAddress?.includes('@')) throw new Error('Missing mailbox identity')
  } catch {
    return redirectToCommunications(origin, { integration: 'gmail', status: 'error', reason: 'profile' })
  }

  // 5. Save encrypted + invalidate cache
  try {
    await saveGmailCredentials(access.companyId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope ?? null,
    emailAddress,
  })
    await invalidateCommunicationsSnapshot(access.companyId)
  } catch (err) {
    const reason = gmailConnectionError(err, 'save')
    console.error('[gmail:callback]', { stage: 'save', reason })
    return redirectToCommunications(origin, { integration: 'gmail', status: 'error', reason })
  }

  return redirectToCommunications(origin, {
    integration: 'gmail',
    status: 'connected',
  })
}
