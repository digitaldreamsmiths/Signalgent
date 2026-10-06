import { NextResponse, type NextRequest } from 'next/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import { createClient } from '@/lib/supabase/server'
import { saveMicrosoftOAuthConfig } from '@/lib/integrations/outlook/config'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function errorResponse(error: unknown): NextResponse {
  if (error instanceof IntegrationAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('[outlook:config]', error instanceof Error ? error.message : 'Unknown error')
  return NextResponse.json({ error: 'Microsoft setup could not be loaded or saved.' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request.nextUrl.searchParams.get('companyId') ?? '')
    const supabase = await createClient()
    const { data, error } = await supabase.from('company_microsoft_oauth_configs')
      .select('tenant_id,client_id').eq('company_id', access.companyId).maybeSingle()
    if (error) throw error
    return NextResponse.json({
      configured: !!data,
      tenantId: data?.tenant_id ?? '',
      clientId: data?.client_id ?? '',
      redirectUri: new URL('/api/integrations/outlook/callback', request.nextUrl.origin).toString(),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { companyId?: string; tenantId?: string; clientId?: string; clientSecret?: string }
    const access = await requireCompanyAccess(body.companyId ?? '')
    const supabase = await createClient()
    const { data: member, error: memberError } = await supabase.from('workspace_members')
      .select('role').eq('workspace_id', access.workspaceId).eq('user_id', access.userId).single()
    if (memberError) throw memberError
    if (member.role !== 'owner' && member.role !== 'admin') {
      return NextResponse.json({ error: 'Only a company administrator can save Microsoft setup.' }, { status: 403 })
    }
    const tenantId = (body.tenantId ?? '').trim()
    const clientId = (body.clientId ?? '').trim()
    const newSecret = (body.clientSecret ?? '').trim()
    if (!UUID.test(tenantId) || !UUID.test(clientId)) {
      return NextResponse.json({ error: 'Enter valid tenant and application IDs.' }, { status: 400 })
    }
    const { data: existing, error: existingError } = await supabase.from('company_microsoft_oauth_configs')
      .select('tenant_id,client_id,client_secret_ciphertext')
      .eq('company_id', access.companyId).maybeSingle()
    if (existingError) throw existingError
    if (!newSecret && (!existing || existing.tenant_id !== tenantId || existing.client_id !== clientId)) {
      return NextResponse.json({ error: 'Enter the client secret Value for this app registration.' }, { status: 400 })
    }
    if (!newSecret) return NextResponse.json({ configured: true })

    // A new app or secret must not leave an old mailbox token available for sending.
    const { error: disconnectError } = await supabase.from('connected_accounts')
      .update({ status: 'disconnected', access_token: null, refresh_token: null, token_expires_at: null })
      .eq('company_id', access.companyId).eq('service', 'outlook')
    if (disconnectError) throw disconnectError
    await saveMicrosoftOAuthConfig(access.companyId, tenantId, clientId, newSecret)
    return NextResponse.json({ configured: true })
  } catch (error) {
    return errorResponse(error)
  }
}
