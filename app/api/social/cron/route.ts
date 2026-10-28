import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { runScheduledPublishing } from '@/lib/platform/publish'

/**
 * Scheduled social publishing tick. Posts planned Social studio items that
 * opted into automatic publishing once their planned time passes. Same
 * guard as the outreach cron (bearer CRON_SECRET), same five-minute cadence
 * from vercel.json. Kept separate from /api/outreach/cron because that one
 * iterates companies with outreach sending enabled, and a company can plan
 * social content without ever sending cold email.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Server is missing Supabase configuration' }, { status: 500 })

  const svc = createServiceClient<Database>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const result = await runScheduledPublishing(svc)
    if (result.errors.length) console.error('[social-cron]', result.errors.join('; '))
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[social-cron] tick failed: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
