/**
 * Reply / bounce scanner. Closes the outreach feedback loop: for every prospect
 * still `open` that we've emailed in the last 30 days, read its Gmail thread and,
 * if an inbound reply or a bounce has landed, move the prospect off `open`. The
 * send worker already treats any non-`open` disposition as a suppression signal,
 * so this is all it takes to stop drip-sending to people who replied or bounced.
 *
 * Thread-driven, not inbox-driven: we already own each send's `thread_id`, so
 * correlation back to a prospect is exact and the working set shrinks as
 * prospects close. Replies map to the neutral `replied` disposition (human
 * triages sentiment later); bounces map to `bounced`. Bounce takes precedence.
 *
 * Plain module (NOT 'use server') so it runs under both the unauthenticated
 * cron (service-role client) and an authenticated server action.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { loadSettings } from './worker'
import { loadGmailCredentials } from '@/lib/integrations/gmail/tokens'
import { getThread, type GmailMessage } from '@/lib/integrations/gmail/fetch'
import {
  THREAD_FETCH_CONCURRENCY,
  INTER_BATCH_PAUSE_MS,
  runChunked,
  withRateLimitRetry,
} from '@/lib/integrations/gmail/concurrency'

type DB = SupabaseClient<Database>

/** Don't re-scan a company more often than this (cron fires every ~5 min). */
const SCAN_MIN_INTERVAL_MIN = 20
/** Only consider sends from the last N days — bounds the working set. */
const LOOKBACK_DAYS = 30
/** Cap threads fetched per run for bounded latency. */
const MAX_THREADS = 200

export interface ScanResult {
  replied: number
  bounced: number
  /** Replies whose text asks to stop (opt-out). A subset of inbound replies,
   * auto-routed to the 'unsubscribed' disposition so we never email them again. */
  unsubscribed: number
  /** Set when the pass did no work (and why); useful for the manual button. */
  skipped?: string
}

function header(msg: GmailMessage, name: string): string {
  const h = (msg.payload?.headers ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? ''
}

const BOUNCE_SUBJECT_RE = /delivery status notification|undeliverable|delivery has failed|mail delivery (failed|subsystem)|returned mail|failure notice/i
const BOUNCE_FROM_RE = /mailer-daemon|postmaster|mail delivery (system|subsystem)/i

/** Opt-out / unsubscribe intent in a reply's subject or snippet. Deliberately
 * broad — a false positive only suppresses one address (recoverable via Reopen),
 * whereas a false negative means emailing someone who asked us to stop (a
 * CAN-SPAM problem). Matched against the metadata we already fetch. */
const OPT_OUT_RE = /\b(unsubscrib\w*|opt[\s-]?out|stop|cancel|remove me|remove my (?:name|email)|take me off|take my (?:name|email) off|no longer (?:wish|want|interested)|do ?n[o']?t (?:contact|email|message)|do not (?:contact|email|message)|leave me alone)\b/i

/** True when an inbound (non-bounce) message reads as an opt-out request. */
function isOptOut(msg: GmailMessage): boolean {
  return OPT_OUT_RE.test(header(msg, 'Subject')) || OPT_OUT_RE.test(msg.snippet ?? '')
}

/** A message is a bounce/DSN if it's from a daemon, looks like a failure
 * notice, or carries a delivery-status report MIME type. */
function isBounce(msg: GmailMessage): boolean {
  const from = header(msg, 'From')
  const subject = header(msg, 'Subject')
  const contentType = header(msg, 'Content-Type')
  return (
    BOUNCE_FROM_RE.test(from) ||
    BOUNCE_SUBJECT_RE.test(subject) ||
    /multipart\/report|report-type=delivery-status/i.test(contentType)
  )
}

function internalMs(msg: GmailMessage): number {
  const n = Number(msg.internalDate)
  return Number.isFinite(n) ? n : 0
}

type Verdict =
  | { kind: 'bounced' | 'replied' | 'unsubscribed'; at: string; from: string; subject: string; snippet: string }
  | null

/** From/Subject/snippet preview of an inbound message. The Gmail metadata fetch
 * already returns all three, so this is free. Trimmed so a runaway subject or
 * snippet can't bloat the row. */
function preview(msg: GmailMessage): { from: string; subject: string; snippet: string } {
  return {
    from: header(msg, 'From').slice(0, 320),
    subject: header(msg, 'Subject').slice(0, 320),
    snippet: (msg.snippet ?? '').trim().slice(0, 500),
  }
}

/** Inspect a thread's messages relative to our mailbox and return the outcome.
 * Precedence: bounce > opt-out > plain reply. The chosen message is the earliest
 * matching inbound one, and its sender/subject/snippet ride along for the in-app
 * preview. An opt-out anywhere in the thread wins over a neutral reply so a "stop
 * emailing me" is never downgraded to a normal reply. */
function classifyThread(messages: GmailMessage[], ourEmail: string): Verdict {
  const mine = ourEmail.toLowerCase()
  let bounce: { ts: number; msg: GmailMessage } | null = null
  let optout: { ts: number; msg: GmailMessage } | null = null
  let reply: { ts: number; msg: GmailMessage } | null = null

  for (const m of messages) {
    const labels = m.labelIds ?? []
    if (labels.includes('SENT')) continue // our own outbound
    const from = header(m, 'From').toLowerCase()
    if (from.includes(mine)) continue // self / our address
    // Inbound: Gmail labels received mail INBOX; daemons/DSNs land there too.
    if (!labels.includes('INBOX')) continue
    const ts = internalMs(m)
    if (isBounce(m)) {
      if (bounce === null || ts < bounce.ts) bounce = { ts, msg: m }
      continue
    }
    if (reply === null || ts < reply.ts) reply = { ts, msg: m }
    if (isOptOut(m) && (optout === null || ts < optout.ts)) optout = { ts, msg: m }
  }

  if (bounce) return { kind: 'bounced', at: new Date(bounce.ts).toISOString(), ...preview(bounce.msg) }
  if (optout) return { kind: 'unsubscribed', at: new Date(optout.ts).toISOString(), ...preview(optout.msg) }
  if (reply) return { kind: 'replied', at: new Date(reply.ts).toISOString(), ...preview(reply.msg) }
  return null
}

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

/**
 * Scan replies/bounces for one company. Returns counts of newly-detected
 * outcomes. Pass `{ force: true }` (manual button) to bypass the throttle.
 */
export async function scanReplies(supabase: DB, companyId: string, opts: { force?: boolean } = {}): Promise<ScanResult> {
  const { data: settings } = await supabase
    .from('outreach_settings')
    .select('active, provider, last_reply_scan_at')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!settings || !settings.active) return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'sending inactive' }
  if (settings.provider !== 'gmail') return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'provider not gmail' }

  if (!opts.force && settings.last_reply_scan_at) {
    const ageMin = (Date.now() - new Date(settings.last_reply_scan_at).getTime()) / 60000
    if (ageMin < SCAN_MIN_INTERVAL_MIN) return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'throttled' }
  }

  const creds = await loadGmailCredentials(companyId, supabase)
  if (!creds) return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'gmail not connected' }

  // Sent emails worth checking: recent, threaded.
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString()
  const { data: sends } = await supabase
    .from('outreach_sends')
    .select('id, prospect_id, thread_id, sent_at')
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .not('thread_id', 'is', null)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })

  if (!sends || sends.length === 0) {
    await supabase.from('outreach_settings').update({ last_reply_scan_at: new Date().toISOString() }).eq('company_id', companyId)
    return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'no sent emails' }
  }

  // Keep only prospects still open.
  const prospectIds = [...new Set(sends.map((s) => s.prospect_id))]
  const { data: prospects } = await supabase
    .from('outreach_prospects')
    .select('id, disposition')
    .eq('company_id', companyId)
    .in('id', prospectIds)
  const open = new Set((prospects ?? []).filter((p) => p.disposition === 'open').map((p) => p.id))

  // One entry per thread (the most recent send, since sends are sorted desc).
  const byThread = new Map<string, { sendId: string; prospectId: string }>()
  for (const s of sends) {
    if (!s.thread_id || !open.has(s.prospect_id)) continue
    if (!byThread.has(s.thread_id)) byThread.set(s.thread_id, { sendId: s.id, prospectId: s.prospect_id })
  }
  const threads = [...byThread.entries()].slice(0, MAX_THREADS)
  if (threads.length === 0) {
    await supabase.from('outreach_settings').update({ last_reply_scan_at: new Date().toISOString() }).eq('company_id', companyId)
    return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'no open threads' }
  }

  const verdicts = await runChunked(
    threads,
    THREAD_FETCH_CONCURRENCY,
    async ([threadId, ref]) => {
      try {
        const thread = await withRateLimitRetry(() =>
          getThread({ accessToken: creds.accessToken, id: threadId, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Content-Type'] }),
        )
        return { ref, verdict: classifyThread(thread.messages ?? [], creds.emailAddress) }
      } catch (err) {
        console.warn('[reply-scan] thread dropped:', err instanceof Error ? err.message.split('\n')[0] : err)
        return { ref, verdict: null as Verdict }
      }
    },
    INTER_BATCH_PAUSE_MS,
  )

  let replied = 0
  let bounced = 0
  let unsubscribed = 0
  for (const { ref, verdict } of verdicts) {
    if (!verdict) continue
    if (verdict.kind === 'bounced') {
      await supabase.from('outreach_sends').update({ bounced_at: verdict.at }).eq('id', ref.sendId)
      await supabase.from('outreach_prospects').update({ disposition: 'bounced', disposition_at: verdict.at }).eq('id', ref.prospectId).eq('company_id', companyId)
      bounced++
    } else if (verdict.kind === 'unsubscribed') {
      // Opt-out: record the inbound timestamp, then close the prospect as
      // unsubscribed so the send worker suppresses it permanently.
      await supabase.from('outreach_sends').update({ replied_at: verdict.at }).eq('id', ref.sendId)
      await supabase.from('outreach_prospects').update({ disposition: 'unsubscribed', disposition_at: verdict.at }).eq('id', ref.prospectId).eq('company_id', companyId)
      unsubscribed++
    } else {
      await supabase.from('outreach_sends').update({ replied_at: verdict.at }).eq('id', ref.sendId)
      await supabase.from('outreach_prospects').update({ disposition: 'replied', disposition_at: verdict.at }).eq('id', ref.prospectId).eq('company_id', companyId)
      replied++
    }
    // Preview fields are a separate, best-effort write so a missing migration
    // (columns not yet added) can never regress disposition detection above.
    await savePreview(supabase, companyId, ref.prospectId, verdict)
  }

  await supabase.from('outreach_settings').update({ last_reply_scan_at: new Date().toISOString() }).eq('company_id', companyId)
  return { replied, bounced, unsubscribed }
}

export interface BounceStats {
  sent: number
  bounced: number
  rate: number
}

/** Bounce rate over the last `windowDays` of actual sends. A send counts as
 * bounced if its thread produced a bounce (bounced_at set by the scanner). */
export async function recentBounceStats(supabase: DB, companyId: string, windowDays: number): Promise<BounceStats> {
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString()
  const { data } = await supabase
    .from('outreach_sends')
    .select('bounced_at')
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .gte('sent_at', cutoff)
  const rows = data ?? []
  const sent = rows.length
  const bounced = rows.filter((r) => r.bounced_at !== null).length
  return { sent, bounced, rate: sent > 0 ? bounced / sent : 0 }
}

/** Auto-pause: when the recent bounce rate exceeds the configured threshold (with
 * a minimum sample), flip sending off and record why. Called on the cron before
 * runQueue. Returns whether it paused this tick. */
export async function enforceBouncePause(supabase: DB, companyId: string): Promise<{ paused: boolean; rate: number }> {
  const settings = await loadSettings(supabase, companyId)
  if (!settings.active || !settings.bounce_pause_enabled) return { paused: false, rate: 0 }
  const { sent, rate } = await recentBounceStats(supabase, companyId, settings.bounce_pause_window_days)
  if (sent < settings.bounce_pause_min_sends || rate <= settings.bounce_pause_threshold) {
    return { paused: false, rate }
  }
  await supabase
    .from('outreach_settings')
    .update({ active: false, pause_reason: 'bounce_rate' })
    .eq('company_id', companyId)
  console.warn(`[auto-pause] company ${companyId} paused: bounce rate ${(rate * 100).toFixed(1)}% over ${sent} sends`)
  return { paused: true, rate }
}
