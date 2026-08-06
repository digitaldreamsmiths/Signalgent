/**
 * Persistence for the two unauthenticated tracking endpoints (open pixel,
 * unsubscribe). The recipient is not a user of this app, so these run with the
 * service role and identify the send by an unguessable per-send token rather
 * than by session.
 *
 * Kept out of the route files so the routes stay thin and the suppression
 * behavior lives next to the rest of the send machinery.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

/**
 * An open recorded within this many seconds of the send is almost never a
 * human: it is the provider's own link/image scanner, a security gateway, or
 * Apple Mail Privacy Protection prefetching on delivery. Counting those would
 * report a ~100% open rate and make the metric useless for the one question it
 * exists to answer.
 */
const OPEN_IGNORE_SECONDS = 15

export function trackingClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Stamp an open. Silent no-op for an unknown token — the endpoint must return
 * the same pixel either way, so a probe can't learn which tokens are real.
 *
 * The counter is read-then-written rather than an atomic increment. Two
 * simultaneous opens of the same email can lose a count; that is acceptable for
 * a metric this noisy, and it avoids a stored procedure for a number nobody
 * makes decisions on. `opened_at` (first open) is the field that matters and it
 * is only ever set once.
 */
export async function recordOpen(token: string): Promise<void> {
  const supabase = trackingClient()
  if (!supabase) return

  const { data: send } = await supabase
    .from('outreach_sends')
    .select('id, opened_at, open_count, sent_at')
    .eq('open_token', token)
    .maybeSingle()
  if (!send) return

  const now = new Date()
  if (send.sent_at) {
    const sinceSend = (now.getTime() - new Date(send.sent_at).getTime()) / 1000
    if (sinceSend < OPEN_IGNORE_SECONDS) return
  }

  await supabase
    .from('outreach_sends')
    .update({
      opened_at: send.opened_at ?? now.toISOString(),
      last_opened_at: now.toISOString(),
      open_count: (send.open_count ?? 0) + 1,
    })
    .eq('id', send.id)
}

export type UnsubscribeResult = 'done' | 'unknown'

/**
 * Suppress a prospect from the unsubscribe link / List-Unsubscribe header.
 *
 * Also cancels their still-queued sends. The worker re-checks disposition
 * before each send, so this is belt-and-braces — but leaving visibly queued
 * mail addressed to someone who just opted out is the kind of thing that turns
 * into a complaint.
 *
 * Idempotent: a second POST on the same token is a no-op that still reports
 * success, which is what RFC 8058 clients expect on retry.
 */
export async function recordUnsubscribe(token: string): Promise<UnsubscribeResult> {
  const supabase = trackingClient()
  if (!supabase) return 'unknown'

  const { data: send } = await supabase
    .from('outreach_sends')
    .select('id, company_id, prospect_id')
    .eq('unsub_token', token)
    .maybeSingle()
  if (!send) return 'unknown'

  const at = new Date().toISOString()
  await supabase.from('outreach_sends').update({ unsubscribed_at: at }).eq('id', send.id)
  await supabase
    .from('outreach_prospects')
    .update({ disposition: 'unsubscribed', disposition_at: at })
    .eq('id', send.prospect_id)
    .eq('company_id', send.company_id)
  await supabase
    .from('outreach_sends')
    .update({ status: 'canceled', error: 'recipient unsubscribed' })
    .eq('prospect_id', send.prospect_id)
    .eq('company_id', send.company_id)
    .eq('status', 'queued')

  return 'done'
}
