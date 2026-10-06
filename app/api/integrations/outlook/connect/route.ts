import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { issueState } from '@/lib/integrations/oauth-state'
import { connectionRedirect } from '@/lib/integrations/connection-errors'
import { authorizeUrl } from '@/lib/integrations/outlook/fetch'
import { loadMicrosoftOAuthConfig } from '@/lib/integrations/outlook/config'

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId') ?? request.nextUrl.searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
  try {
    const access = await requireCompanyAccess(companyId)
    const config = await loadMicrosoftOAuthConfig(access.companyId)
    if (!config) return NextResponse.redirect(connectionRedirect(request.nextUrl.origin, { integration: 'outlook', status: 'error', reason: 'microsoft_setup' }))
    const state = issueState({ companyId: access.companyId, userId: access.userId, service: 'outlook' })
    const redirectUri = new URL('/api/integrations/outlook/callback', request.nextUrl.origin).toString()
    return NextResponse.redirect(authorizeUrl(state, redirectUri, config))
  } catch (error) {
    if (error instanceof IntegrationAuthError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.redirect(connectionRedirect(request.nextUrl.origin, { integration: 'outlook', status: 'error', reason: 'configuration' }))
  }
}
