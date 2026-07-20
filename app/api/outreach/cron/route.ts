import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { runQueue } from '@/lib/integrations/outreach/send/worker'
import { scanReplies, enforceBouncePause } from '@/lib/integrations/outreach/send/scan'
import { enrichToBuffer } from '@/lib/integrations/outreach/enrich-run'
import { runFollowupSweep } from '@/lib/integrations/outreach/followups'

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
  let replied = 0
  let bounced = 0
  let softBounced = 0
  let enriched = 0
  let recovered = 0
  let followupsQueued = 0
  let followupsReview = 0
  const errors: { company_id: string; error: string }[] = []
  for (const c of companies ?? []) {
    // One company blowing up must not kill the tick for the rest.
    try {
      // Deliverability: pause sending if the recent bounce rate is too high.
      await enforceBouncePause(svc, c.company_id)
      // Wave enrichment: keep ~3 days of send capacity enriched-and-ready.
      const wave = await enrichToBuffer(svc, c.company_id, null)
      enriched += wave.enriched
      // Drip: send what's due (runQueue bails if auto-pause just deactivated it).
      const r = await runQueue(svc, c.company_id)
      sent += r.sent
      failed += r.failed
      recovered += r.recovered
      // Close the loop: detect inbound replies/bounces and suppress those prospects.
      const scan = await scanReplies(svc, c.company_id)
      replied += scan.replied
      bounced += scan.bounced
      softBounced += scan.softBounced ?? 0
      // Sequences: AFTER the reply scan, so a prospect who answered this tick is
      // already suppressed before the sweep considers nudging them.
      const fu = await runFollowupSweep(svc, c.company_id)
      followupsQueued += fu.queued
      followupsReview += fu.review
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[outreach-cron] company ${c.company_id} failed: ${message}`)
      errors.push({ company_id: c.company_id, error: message })
    }
  }
  return NextResponse.json({ companies: companies?.length ?? 0, sent, failed, recovered, replied, bounced, softBounced, enriched, followupsQueued, followupsReview, errors })
}

// Vercel Cron invokes via GET; Supabase pg_cron (pg_net) posts. Support both.
export const GET = handle
export const POST = handle
