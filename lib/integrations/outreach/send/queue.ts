/**
 * Draft → send-queue core. Plain module (NOT 'use server') so it can run under
 * both the user-scoped server actions and the unauthenticated cron
 * (service-role client) — the same split as worker.ts.
 */

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { getAccount } from '@/lib/integrations/accounts'
import { composeEmail } from './compose'
import { loadSettings, nextSlot } from './worker'

type DB = SupabaseClient<Database>

/**
 * Insert send rows, retrying without the open/unsubscribe tokens if the first
 * attempt fails. The tracking columns arrive via a migration applied
 * out-of-band, so there is a window where this code is deployed and the columns
 * are not; without the fallback, queuing a send would just error out until
 * someone ran the migration. A Postgres insert that errors inserts nothing, so
 * the retry can't duplicate rows.
 *
 * Returns null on success, or the error from the fallback attempt.
 */
export async function insertSendRows(
  supabase: DB,
  withTracking: Record<string, unknown>[],
  withoutTracking: Record<string, unknown>[],
): Promise<{ message: string } | null> {
  const first = await supabase.from('outreach_sends').insert(withTracking as never)
  if (!first.error) return null
  console.warn(`[outreach:send] insert with tracking failed (${first.error.message}); retrying without`)
  const second = await supabase.from('outreach_sends').insert(withoutTracking as never)
  return second.error ?? null
}

/**
 * Best-effort auto-queue of an (auto-approved) template draft at the next drip
 * slot. Every gate that queueDraftSend surfaces to the user is a silent skip
 * here: sending off, no sender, Gmail disconnected, prospect closed, or an
 * active send already queued all leave the draft 'approved' in Ready to email,
 * where it can be scheduled manually. Returns whether a send was queued.
 */
export async function autoQueueDraftSend(supabase: DB, companyId: string, draftId: string): Promise<boolean> {
  try {
    const settings = await loadSettings(supabase, companyId)
    if (!settings.active || !settings.sender_email?.trim()) return false
    if (settings.provider === 'gmail') {
      const gmail = await getAccount(companyId, 'gmail', supabase)
      if (gmail?.status !== 'connected') return false
    }

    const { data: draft } = await supabase
      .from('outreach_drafts')
      .select('id, subject, body, prospect_id')
      .eq('id', draftId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!draft) return false

    const { data: prospect } = await supabase
      .from('outreach_prospects')
      .select('email, disposition')
      .eq('id', draft.prospect_id)
      .maybeSingle()
    if (!prospect?.email || prospect.disposition !== 'open') return false

    const { data: existing } = await supabase
      .from('outreach_sends')
      .select('id')
      .eq('draft_id', draftId)
      .in('status', ['queued', 'sending', 'sent'])
      .limit(1)
    if (existing && existing.length > 0) return false

    // Tokens are minted here, not by a column default: the unsubscribe link has
    // to be inside the body, and the body is composed before the row exists.
    const open_token = randomUUID()
    const unsub_token = randomUUID()
    const composed = composeEmail(draft.subject, draft.body, settings, unsub_token)
    const scheduled_at = await nextSlot(supabase, companyId, settings)

    const base = {
      company_id: companyId,
      prospect_id: draft.prospect_id,
      draft_id: draftId,
      provider: settings.provider,
      recipient_email: prospect.email,
      subject: composed.subject,
      body: composed.body,
      status: 'queued' as const,
      scheduled_at,
    }
    const error = await insertSendRows(supabase, [{ ...base, open_token, unsub_token }], [base])
    if (error) {
      console.warn(`[outreach:auto-queue] could not queue draft ${draftId}: ${error.message}`)
      return false
    }
    return true
  } catch (e) {
    console.warn(`[outreach:auto-queue] skipped draft ${draftId}: ${e instanceof Error ? e.message : e}`)
    return false
  }
}
