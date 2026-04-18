import { NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export async function POST(request: Request) {
  const ssr = await createSsrClient()
  const { data: { user }, error: authError } = await ssr.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: {
    workspaceName?: string
    workspaceSlug?: string
    companyName?: string
    industry?: string | null
    website?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const workspaceName = body.workspaceName?.trim()
  const workspaceSlug = body.workspaceSlug?.trim()
  const companyName = body.companyName?.trim()
  if (!workspaceName || !workspaceSlug || !companyName) {
    return NextResponse.json({ error: 'workspaceName, workspaceSlug, and companyName are required' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing Supabase configuration' }, { status: 500 })
  }

  const svc = createServiceClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: workspace, error: wsError } = await svc
    .from('workspaces')
    .insert({ name: workspaceName, slug: workspaceSlug })
    .select('id')
    .single()
  if (wsError || !workspace) {
    return NextResponse.json({ error: wsError?.message ?? 'workspace insert failed', step: 'workspace' }, { status: 500 })
  }

  const { error: memberError } = await svc
    .from('workspace_members')
    .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' })
  if (memberError) {
    return NextResponse.json({ error: memberError.message, step: 'member' }, { status: 500 })
  }

  const { error: companyError } = await svc
    .from('companies')
    .insert({
      workspace_id: workspace.id,
      name: companyName,
      slug: slugify(companyName),
      industry: body.industry ?? null,
      website: body.website ?? null,
    })
  if (companyError) {
    return NextResponse.json({ error: companyError.message, step: 'company' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, workspaceId: workspace.id })
}
