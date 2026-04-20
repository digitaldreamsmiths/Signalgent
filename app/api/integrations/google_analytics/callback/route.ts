/**
 * GET /api/integrations/google_analytics/callback
 *
 * Google redirects the browser here after OAuth. Validates state signature
 * and expiry, re-checks that the authenticated user still owns the company,
 * exchanges the code, calls the GA Admin API to enumerate properties the
 * user has access to, auto-picks the first one, saves encrypted tokens,
 * redirects to /analytics.
 *
 * Auto-pick policy: GA4 users commonly have multiple properties (every
 * website + app they've ever created stays in the account summaries list).
 * For v1 we pick the first property Google returns — same "simplest sane
 * default" approach as Gmail (which picks the single mailbox Google auth'd).
 * A multi-property picker UI is a Session 10.5 follow-up.
 *
 * Idempotent on (company_id, service): a replayed callback with the same
 * state will upsert the same row.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { verifyState, InvalidStateError } from '@/lib/integrations/oauth-state'
import { exchangeCode } from '@/lib/integrations/google/fetch'
import {
  flattenProperties,
  listAccountSummaries,
} from '@/lib/integrations/ga/fetch'
import {
  saveGoogleAnalyticsCredentials,
  GOOGLE_ANALYTICS_SERVICE,
} from '@/lib/integrations/ga/tokens'
import { invalidateAnalyticsSnapshot } from '@/lib/integrations/ga/snapshot'

function redirectToAnalytics(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL('/analytics', origin)
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

  if (googleError) {
    return redirectToAnalytics(origin, {
      integration: 'google_analytics',
      status: 'cancelled',
      reason: googleErrorDesc ?? googleError,
    })
  }

  if (!code || !stateParam) {
    return redirectToAnalytics(origin, {
      integration: 'google_analytics',
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
      return redirectToAnalytics(origin, {
        integration: 'google_analytics',
        status: 'error',
        reason: err.message,
      })
    }
    throw err
  }

  if (payload.service !== GOOGLE_ANALYTICS_SERVICE) {
    return redirectToAnalytics(origin, {
      integration: 'google_analytics',
      status: 'error',
      reason: 'State service mismatch',
    })
  }

  // 2. Re-verify the authenticated user still owns this company and
  //    matches the user embedded in the state (defence in depth against
  //    session swaps mid-flow).
  let access
  try {
    access = await requireCompanyAccess(payload.companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return redirectToAnalytics(origin, {
        integration: 'google_analytics',
        status: 'error',
        reason: err.message,
      })
    }
    throw err
  }
  if (access.userId !== payload.userId) {
    return redirectToAnalytics(origin, {
      integration: 'google_analytics',
      status: 'error',
      reason: 'User mismatch on callback',
    })
  }

  // 3. Exchange code for tokens. Redirect URI must exactly match the
  //    authorize step — Google validates it server-side.
  const redirectUri = new URL(
    '/api/integrations/google_analytics/callback',
    origin
  ).toString()
  let tokens
  try {
    tokens = await exchangeCode({ code, redirectUri })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token exchange failed'
    return redirectToAnalytics(origin, {
      integration: 'google_analytics',
      status: 'error',
      reason: msg,
    })
  }

  // 4. Enumerate properties the user has access to, pick the first.
  let propertyResourceName: string
  let propertyDisplayName: string
  try {
    const summaries = await listAccountSummaries(tokens.access_token)
    const properties = flattenProperties(summaries)
    if (properties.length === 0) {
      return redirectToAnalytics(origin, {
        integration: 'google_analytics',
        status: 'error',
        reason: 'No GA4 properties found on this Google account',
      })
    }
    propertyResourceName = properties[0].resourceName
    propertyDisplayName = properties[0].displayName
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Property discovery failed'
    return redirectToAnalytics(origin, {
      integration: 'google_analytics',
      status: 'error',
      reason: msg,
    })
  }

  // 5. Save encrypted + invalidate cache
  await saveGoogleAnalyticsCredentials(access.companyId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope ?? null,
    propertyResourceName,
    propertyDisplayName,
  })
  await invalidateAnalyticsSnapshot(access.companyId)

  return redirectToAnalytics(origin, {
    integration: 'google_analytics',
    status: 'connected',
  })
}
