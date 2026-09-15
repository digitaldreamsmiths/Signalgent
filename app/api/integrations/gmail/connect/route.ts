/**
 * GET /api/integrations/gmail/connect?companyId=<uuid>
 *
 * Initiates Google OAuth for Gmail. Validates that the authenticated user
 * has access to the company, issues a signed time-limited state token,
 * and redirects the browser to Google's consent screen.
 *
 * This route shadows the generic [service] handler for Gmail specifically,
 * to use the hardened oauth-state + encrypted-tokens + refresh-aware
 * pattern that Stripe uses. Other services continue to use the legacy
 * generic handler until they are migrated.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { issueState } from '@/lib/integrations/oauth-state'
import { buildAuthorizeUrl } from '@/lib/integrations/gmail/fetch'
import { GMAIL_SERVICE } from '@/lib/integrations/gmail/tokens'
import { gmailConnectionError } from '@/lib/integrations/gmail/connection-errors'

export async function GET(request: NextRequest) {
  // The connections UI sends `company_id` (the app-wide convention); accept the
  // legacy `companyId` too so old links keep working.
  const companyId = request.nextUrl.searchParams.get('company_id') ?? request.nextUrl.searchParams.get('companyId')

  try {
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    }
    const access = await requireCompanyAccess(companyId)

    const redirectUri = new URL('/api/integrations/gmail/callback', request.nextUrl.origin).toString()
    const state = issueState({
      companyId: access.companyId,
      userId: access.userId,
      service: GMAIL_SERVICE,
    })

    const authorizeUrl = buildAuthorizeUrl({ state, redirectUri })
    return NextResponse.redirect(authorizeUrl)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const reason = gmailConnectionError(err, 'configuration')
    console.error('[gmail:connect]', { reason })
    const url = new URL('/connections', request.nextUrl.origin)
    url.searchParams.set('integration', 'gmail')
    url.searchParams.set('status', 'error')
    url.searchParams.set('reason', reason)
    return NextResponse.redirect(url)
  }
}
