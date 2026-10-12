/**
 * Persist scan verdicts. Split out of scan.ts so each provider's scanner
 * (Gmail thread-driven, Outlook inbox-driven) can share one write path
 * without importing each other.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { suppressRecipient } from './suppression'
import type { Verdict } from './classify'

type DB = SupabaseClient<Database>

/** Persist the inbound preview (from/subject/snippet) on the prospect. Isolated
 * and error-swallowing on purpose: the reply_* columns arrive in a separate
 * migration, so if they're not present yet this must NOT throw and take down the
 * disposition write that already happened. */
async function savePreview(
  supabase: DB,
  companyId: string,
  prospectId: string,
  v: NonNullable<Verdict>,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('outreach_prospects')
      .update({ reply_from: v.from, reply_subject: v.subject, reply_snippet: v.snippet })
      .eq('id', prospectId)
      .eq('company_id', companyId)
    if (error) console.warn('[reply-scan] preview not saved (migration pending?):', error.message)
  } catch (err) {
    console.warn('[reply-scan] preview write failed:', err instanceof Error ? err.message : err)
  }
}

/** One prospect's scan outcome, ready to persist. `sendId` is the send whose
 * thread (or address) produced the inbound message. */
export interface ScanVerdict {
  sendId: string
  prospectId: string
  email: string
  verdict: Verdict
}

/** Persist a batch of verdicts: mark the send, move the prospect off `open`,
 * cancel its queued mail (via suppressRecipient) and store the preview. Shared
 * by every provider's scanner so the dispositions mean the same thing. */
export async function applyVerdicts(
  supabase: DB,
  companyId: string,
  items: ScanVerdict[],
): Promise<{ replied: number; bounced: number; unsubscribed: number; softBounced: number }> {
  let replied = 0
  let bounced = 0
  let unsubscribed = 0
  let softBounced = 0
  for (const { sendId, prospectId, email, verdict } of items) {
    if (!verdict) continue
    if (verdict.kind === 'soft_bounce') {
      // Temporary failure / delay only: leave the prospect open (the drip keeps
      // trying) and don't touch bounced_at, so it never inflates the rate.
      softBounced++
      continue
    }
    if (verdict.kind === 'bounced') {
      await supabase.from('outreach_sends').update({ bounced_at: verdict.at }).eq('id', sendId)
      await suppressRecipient(supabase, companyId, email, 'bounced', verdict.at)
      bounced++
    } else if (verdict.kind === 'unsubscribed') {
      // Opt-out: record the inbound timestamp, then close the prospect as
      // unsubscribed so the send worker suppresses it permanently.
      await supabase.from('outreach_sends').update({ replied_at: verdict.at }).eq('id', sendId)
      await suppressRecipient(supabase, companyId, email, 'unsubscribed', verdict.at)
      unsubscribed++
    } else {
      await supabase.from('outreach_sends').update({ replied_at: verdict.at }).eq('id', sendId)
      await supabase.from('outreach_prospects').update({ disposition: 'replied', disposition_at: verdict.at }).eq('id', prospectId).eq('company_id', companyId)
      replied++
    }
    // Preview fields are a separate, best-effort write so a missing migration
    // (columns not yet added) can never regress disposition detection above.
    await savePreview(supabase, companyId, prospectId, verdict)
  }
  return { replied, bounced, unsubscribed, softBounced }
}
