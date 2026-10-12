/**
 * Backfill thread ids for Outlook sends that went out before the send path
 * captured them. Without thread_id / message_id_header on the first touch, the
 * worker cannot thread a follow-up under it (it looks for the prospect's latest
 * send WITH a thread id), so the nudge would arrive as an unrelated email.
 *
 * Matches each id-less sent row to its Sent Items copy by recipient, subject
 * and send time (see matchSentCopy). Needs a mailbox that can be read.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { loadOutlookCredentials } from '@/lib/integrations/outlook/tokens'
import { canReadMail, listSentSince, matchSentCopy } from '@/lib/integrations/outlook/fetch'

type DB = SupabaseClient<Database>

export interface ThreadBackfillResult {
  /** Sent rows that had no thread id when the pass started. */
  candidates: number
  matched: number
  unmatched: number
  skipped?: string
  details: { email: string; subject: string; sentAt: string; matched: boolean }[]
}

export async function backfillOutlookThreads(
  supabase: DB,
  companyId: string,
  opts: { dryRun?: boolean } = {},
): Promise<ThreadBackfillResult> {
  const none = (skipped: string): ThreadBackfillResult => ({ candidates: 0, matched: 0, unmatched: 0, skipped, details: [] })

  const creds = await loadOutlookCredentials(companyId, supabase)
  if (!creds) return none('outlook not connected')
  if (!canReadMail(creds.scope)) return none('reconnect the Microsoft 365 mailbox to allow reading mail')

  const { data: rows, error } = await supabase
    .from('outreach_sends')
    .select('id, recipient_email, subject, sent_at')
    .eq('company_id', companyId)
    .eq('provider', 'outlook')
    .eq('status', 'sent')
    .is('thread_id', null)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: true })
  if (error) throw error
  if (!rows || rows.length === 0) return none('nothing to backfill')

  const since = new Date(Date.parse(rows[0].sent_at!) - 15 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const sent = await listSentSince(creds.accessToken, { since, pageSize: 100, maxPages: 30 })

  const result: ThreadBackfillResult = { candidates: rows.length, matched: 0, unmatched: 0, details: [] }
  for (const row of rows) {
    const refs = matchSentCopy(sent, { to: row.recipient_email, subject: row.subject, sentAt: new Date(row.sent_at!) })
    const matched = !!refs && (!!refs.conversationId || !!refs.internetMessageId)
    result.details.push({ email: row.recipient_email, subject: row.subject, sentAt: row.sent_at!, matched })
    if (!matched) {
      result.unmatched++
      continue
    }
    result.matched++
    if (opts.dryRun) continue
    const { error: updateError } = await supabase
      .from('outreach_sends')
      .update({
        thread_id: refs!.conversationId,
        message_id_header: refs!.internetMessageId,
        provider_message_id: refs!.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (updateError) throw updateError
  }
  return result
}
