/**
 * GET /api/integrations/linkedin/connect?companyId=<uuid>
 *
 * Initiates LinkedIn OAuth (OIDC scopes only — member-tier, no review).
 * Mirrors Etsy's connect route: signed state token, PKCE verifier in an
 * HTTP-only path-scoped cookie keyed by sha256(state), redirect to
 * LinkedIn's consent screen.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { issueState } from '@/lib/integrations/oauth-state'
import {
  buildAuthorizeUrl,
  generatePkce,
} from '@/lib/integrations/linkedin/fetch'
import { LINKEDIN_SERVICE } from '@/lib/integrations/linkedin/tokens'
import {
  stateCookieKey,
  writePkceCookie,
} from '@/lib/integrations/linkedin/pkce-cookie'

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

    const { codeVerifier, codeChallenge } = generatePkce()
    const state = issueState({
      companyId: access.companyId,
      userId: access.userId,
      service: LINKEDIN_SERVICE,
    })

    const authorizeUrl = buildAuthorizeUrl({
      state,
      redirectUri,
      codeChallenge,
    })

    const response = NextResponse.redirect(authorizeUrl)
    writePkceCookie(response, stateCookieKey(state), codeVerifier)
    return response
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
