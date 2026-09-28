import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { issueState } from '@/lib/integrations/oauth-state'
import { authorizeUrl } from '@/lib/integrations/outlook/fetch'

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get('companyId') ?? request.nextUrl.searchParams.get('company_id')
  if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
  try {
    const access = await requireCompanyAccess(companyId)
    const state = issueState({ companyId: access.companyId, userId: access.userId, service: 'outlook' })
    const redirectUri = new URL('/api/integrations/outlook/callback', request.nextUrl.origin).toString()
    return NextResponse.redirect(authorizeUrl(state, redirectUri))
  } catch (error) {
    if (error instanceof IntegrationAuthError) return NextResponse.json({ error: error.message }, { status: error.status })
    const url = new URL('/connections', request.nextUrl.origin)
    url.searchParams.set('integration', 'outlook')
    url.searchParams.set('status', 'error')
    url.searchParams.set('reason', 'configuration')
    return NextResponse.redirect(url)
  }
}
