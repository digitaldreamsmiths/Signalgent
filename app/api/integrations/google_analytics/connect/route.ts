/**
 * GET /api/integrations/google_analytics/connect?companyId=<uuid>
 *
 * Initiates Google OAuth for Google Analytics (GA4). Validates that the
 * authenticated user has access to the company, issues a signed time-limited
 * state token, and redirects the browser to Google's consent screen with
 * the `analytics.readonly` scope.
 *
 * Mirrors /api/integrations/gmail/connect. The two routes share the OAuth
 * primitives in lib/integrations/google/fetch.ts but scope the
 * authorization independently — connecting one service does not grant
 * access to the other, and revoking one does not affect the other.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { issueState } from '@/lib/integrations/oauth-state'
import { buildAuthorizeUrl } from '@/lib/integrations/google/fetch'
import { GA_SCOPES } from '@/lib/integrations/ga/fetch'
import { GOOGLE_ANALYTICS_SERVICE } from '@/lib/integrations/ga/tokens'

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId')

  try {
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }
    const access = await requireCompanyAccess(companyId)

    const redirectUri = new URL(
      '/api/integrations/google_analytics/callback',
      request.nextUrl.origin
    ).toString()
    const state = issueState({
      companyId: access.companyId,
      userId: access.userId,
      service: GOOGLE_ANALYTICS_SERVICE,
    })

    const authorizeUrl = buildAuthorizeUrl({
      state,
      redirectUri,
      scope: GA_SCOPES,
    })
    return NextResponse.redirect(authorizeUrl)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
