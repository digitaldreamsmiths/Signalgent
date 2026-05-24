/**
 * GET /api/integrations/linkedin/connect?companyId=<uuid>
 *
 * Initiates LinkedIn OAuth (OIDC scopes only — member-tier, no review).
 * Confidential-client flow: signed state token, no PKCE. See
 * lib/integrations/linkedin/fetch.ts for the reasoning.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { issueState } from '@/lib/integrations/oauth-state'
import { buildAuthorizeUrl } from '@/lib/integrations/linkedin/fetch'
import { LINKEDIN_SERVICE } from '@/lib/integrations/linkedin/tokens'

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId')

  try {
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }
    const access = await requireCompanyAccess(companyId)

    const redirectUri = new URL(
      '/api/integrations/linkedin/callback',
      request.nextUrl.origin
    ).toString()

    const state = issueState({
      companyId: access.companyId,
      userId: access.userId,
      service: LINKEDIN_SERVICE,
    })

    const authorizeUrl = buildAuthorizeUrl({ state, redirectUri })
    return NextResponse.redirect(authorizeUrl)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
