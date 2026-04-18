import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ServiceId } from '@/lib/integrations/services'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params
  const body = await request.json() as { company_id?: string }
  const { company_id } = body

  if (!company_id) {
    return NextResponse.json({ error: 'missing_company_id' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Verify the user belongs to the company's workspace
  const { data: company } = await supabase
    .from('companies')
    .select('workspace_id')
    .eq('id', company_id)
    .single()

  if (!company) {
    return NextResponse.json({ error: 'company_not_found' }, { status: 404 })
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', company.workspace_id)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Mark the connection as revoked (soft delete so audit trail is preserved)
  const { error } = await supabase
    .from('connected_accounts')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('company_id', company_id)
    .eq('service', service as ServiceId)

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
