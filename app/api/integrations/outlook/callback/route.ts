import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess } from '@/lib/integrations/auth'
import { verifyState } from '@/lib/integrations/oauth-state'
import { exchangeCode, mailboxProfile } from '@/lib/integrations/outlook/fetch'
import { saveOutlookCredentials } from '@/lib/integrations/outlook/tokens'

function result(origin: string, status: string, reason?: string): NextResponse {
  const url = new URL('/connections', origin)
  url.searchParams.set('integration', 'outlook')
  url.searchParams.set('status', status)
  if (reason) url.searchParams.set('reason', reason)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  if (searchParams.has('error')) return result(origin, 'cancelled')
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (!code || !state) return result(origin, 'error', 'invalid_state')
  let companyId: string
  try {
    const payload = verifyState(state)
    if (payload.service !== 'outlook') return result(origin, 'error', 'invalid_state')
    const access = await requireCompanyAccess(payload.companyId)
    if (access.userId !== payload.userId) return result(origin, 'error', 'unauthorized')
    companyId = access.companyId
  } catch {
    return result(origin, 'error', 'invalid_state')
  }
  try {
    const redirectUri = new URL('/api/integrations/outlook/callback', origin).toString()
    const tokens = await exchangeCode(code, redirectUri)
    if (!tokens.refresh_token) return result(origin, 'error', 'offline_access_missing')
    const profile = await mailboxProfile(tokens.access_token)
    const email = (profile.mail || profile.userPrincipalName || '').toLowerCase()
    if (!email.includes('@')) return result(origin, 'error', 'profile')
    await saveOutlookCredentials(companyId, email, tokens)
    return result(origin, 'connected')
  } catch (error) {
    console.error('[outlook:callback]', error instanceof Error ? error.message : 'Unknown error')
    return result(origin, 'error', 'connection_failed')
  }
}
