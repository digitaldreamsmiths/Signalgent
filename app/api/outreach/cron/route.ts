import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { runQueue } from '@/lib/integrations/outreach/send/worker'

/**
 * Drip worker tick. Processes the due send queue for every company with sending
 * enabled. Intended to be called every ~5 minutes by Supabase pg_cron (see the
 * commented SQL in the 20260620000000_outreach_sending.sql migration) or Vercel
 * Cron. Guarded by a bearer CRON_SECRET. Also reachable from the in-app
 * "Process queue now" button (which goes through the authenticated server
 * action instead).
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing Supabase configuration' }, { status: 500 })
  }

  const svc = createServiceClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: companies, error } = await svc
    .from('outreach_settings')
    .select('company_id')
    .eq('active', true)
  if (error) return NextResponse.json({ error: 'Could not load companies' }, { status: 500 })

  let sent = 0
  let failed = 0
  for (const c of companies ?? []) {
    const r = await runQueue(svc, c.company_id)
    sent += r.sent
    failed += r.failed
  }
  return NextResponse.json({ companies: companies?.length ?? 0, sent, failed })
}

// Vercel Cron invokes via GET; Supabase pg_cron (pg_net) posts. Support both.
export const GET = handle
export const POST = handle
