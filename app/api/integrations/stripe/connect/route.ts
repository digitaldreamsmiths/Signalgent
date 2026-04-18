/**
 * GET /api/integrations/stripe/connect?companyId=<uuid>
 *
 * Initiates Stripe Connect OAuth. Validates that the authenticated user
 * has access to the company, issues a signed time-limited state token,
 * and redirects the browser to Stripe.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { issueState } from '@/lib/integrations/oauth-state'
import { buildAuthorizeUrl } from '@/lib/integrations/stripe/fetch'
import { STRIPE_SERVICE } from '@/lib/integrations/stripe/tokens'

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId')

  try {
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }
    const access = await requireCompanyAccess(companyId)

    const redirectUri = new URL('/api/integrations/stripe/callback', request.nextUrl.origin).toString()
    const state = issueState({
      companyId: access.companyId,
      userId: access.userId,
      service: STRIPE_SERVICE,
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
