/**
 * GET /api/integrations/etsy/connect?companyId=<uuid>
 *
 * Initiates Etsy OAuth. Validates that the authenticated user has
 * access to the company, issues a signed time-limited state token,
 * generates a PKCE verifier + challenge, stores the verifier in an
 * HTTP-only cookie keyed by a hash of the state token, and redirects
 * the browser to Etsy's consent screen.
 *
 * Mirrors /api/integrations/gmail/connect structurally, with two
 * differences from the Google pattern:
 *   1. PKCE — Etsy requires it on every flow.
 *   2. Verifier persistence — stateless state can't carry the verifier,
 *      so it lives in a short-lived path-scoped cookie.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { issueState } from '@/lib/integrations/oauth-state'
import {
  buildAuthorizeUrl,
  generatePkce,
} from '@/lib/integrations/etsy/fetch'
import { ETSY_SERVICE } from '@/lib/integrations/etsy/tokens'
import {
  stateCookieKey,
  writePkceCookie,
} from '@/lib/integrations/etsy/pkce-cookie'

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId')

  try {
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }
    const access = await requireCompanyAccess(companyId)

    const redirectUri = new URL(
      '/api/integrations/etsy/callback',
      request.nextUrl.origin
    ).toString()

    const { codeVerifier, codeChallenge } = generatePkce()
    const state = issueState({
      companyId: access.companyId,
      userId: access.userId,
      service: ETSY_SERVICE,
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
