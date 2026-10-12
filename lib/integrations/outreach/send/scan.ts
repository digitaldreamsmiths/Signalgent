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
import { classifyInbound, type InboundMessage, type Verdict, type VerdictKind } from './classify'
import { applyVerdicts } from './apply'
import { scanOutlookReplies } from './scan-outlook'
import {
  THREAD_FETCH_CONCURRENCY,
  INTER_BATCH_PAUSE_MS,
  runChunked,
  withRateLimitRetry,
} from '@/lib/integrations/gmail/concurrency'

type DB = SupabaseClient<Database>

/** Don't re-scan a company more often than this (cron fires every ~5 min). */
const SCAN_MIN_INTERVAL_MIN = 4
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
  /** Temporary delivery failures / delay notices detected but deliberately not
   * acted on: the prospect stays `open` and it never counts toward the bounce
   * rate. Reported for observability only. */
  softBounced?: number
  /** Set when the pass did no work (and why); useful for the manual button. */
  skipped?: string
  /** Outlook only: messages read from the mailbox this pass. */
  scanned?: number
  /** Outlook only: inbound messages that mapped to no open prospect. */
  unmatched?: number
  /** Per-prospect outcomes this pass produced (or would, on a dry run). */
  details?: { email: string; kind: VerdictKind; at: string; from: string; subject: string }[]
}

function header(msg: GmailMessage, name: string): string {
  const h = (msg.payload?.headers ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? ''
}

function internalMs(msg: GmailMessage): number {
  const n = Number(msg.internalDate)
  return Number.isFinite(n) ? n : 0
}

/** Adapt a Gmail metadata message to the provider-neutral classifier shape. */
function toInbound(msg: GmailMessage): InboundMessage {
  return {
    from: header(msg, 'From'),
    subject: header(msg, 'Subject'),
    snippet: msg.snippet ?? '',
    contentType: header(msg, 'Content-Type'),
    ts: internalMs(msg),
  }
}

/** Inspect a thread's messages relative to our mailbox and return the outcome
 * (see classifyInbound for precedence). Our own outbound mail and drafts are
 * dropped first; an archived inbound message loses INBOX but still counts. */
function classifyThread(messages: GmailMessage[], ourEmail: string): Verdict {
  const mine = ourEmail.toLowerCase()
  const inbound: InboundMessage[] = []
  for (const m of messages) {
    const labels = m.labelIds ?? []
    if (labels.includes('SENT') || labels.includes('DRAFT')) continue
    if (header(m, 'From').toLowerCase().includes(mine)) continue // self / our address
    inbound.push(toInbound(m))
  }
  return classifyInbound(inbound)
}

/**
 * Scan replies/bounces for one company. Returns counts of newly-detected
 * outcomes. Pass `{ force: true }` (manual button) to bypass the throttle.
 * Dispatches on the sending provider: Gmail is thread-driven (we own each
 * send's thread id), Outlook is inbox-driven (see scan-outlook.ts).
 */
export async function scanReplies(supabase: DB, companyId: string, opts: { force?: boolean; dryRun?: boolean } = {}): Promise<ScanResult> {
  const { data: settings, error: settingsError } = await supabase
    .from('outreach_settings')
    .select('active, provider, sender_email, warmup_started_at, last_reply_scan_at')
    .eq('company_id', companyId)
    .maybeSingle()
  if (settingsError) throw settingsError

  if (!settings || !settings.active) return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'sending inactive' }
  if (settings.provider !== 'gmail' && settings.provider !== 'outlook') {
    return { replied: 0, bounced: 0, unsubscribed: 0, skipped: `no reply scanning for ${settings.provider}` }
  }

  if (!opts.force && settings.last_reply_scan_at) {
    const ageMin = (Date.now() - new Date(settings.last_reply_scan_at).getTime()) / 60000
    if (ageMin < SCAN_MIN_INTERVAL_MIN) return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'throttled' }
  }

  if (!settings.sender_email?.trim()) return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'sender not set' }

  // Threads from the previous sender are not visible in the newly selected
  // mailbox. Changing sender resets warmup_started_at in saveSendSettings.
  const since = new Date(Math.max(
    Date.now() - LOOKBACK_DAYS * 86400_000,
    settings.warmup_started_at ? new Date(settings.warmup_started_at).getTime() : 0,
  )).toISOString()

  if (settings.provider === 'outlook') {
    return scanOutlookReplies(supabase, companyId, {
      since,
      senderEmail: settings.sender_email,
      lastScanAt: settings.last_reply_scan_at,
      force: opts.force,
      dryRun: opts.dryRun,
    })
  }

  const creds = await loadGmailCredentials(companyId, supabase, undefined, settings.sender_email)
  if (!creds) return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'gmail not connected' }

  const { data: sends, error: sendsError } = await supabase
    .from('outreach_sends')
    .select('id, prospect_id, thread_id, sent_at')
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .not('thread_id', 'is', null)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
  if (sendsError) throw sendsError

  if (!sends || sends.length === 0) {
    await supabase.from('outreach_settings').update({ last_reply_scan_at: new Date().toISOString() }).eq('company_id', companyId)
    return { replied: 0, bounced: 0, unsubscribed: 0, skipped: 'no sent emails' }
  }

  // Keep only prospects still open.
  const prospectIds = [...new Set(sends.map((s) => s.prospect_id))]
  const { data: prospects, error: prospectsError } = await supabase
    .from('outreach_prospects')
    .select('id, email, disposition')
    .eq('company_id', companyId)
    .in('id', prospectIds)
  if (prospectsError) throw prospectsError
  const open = new Set((prospects ?? []).filter((p) => p.disposition === 'open').map((p) => p.id))

  // One entry per thread (the most recent send, since sends are sorted desc).
  const emailByProspect = new Map((prospects ?? []).map((p) => [p.id, p.email]))
  const byThread = new Map<string, { sendId: string; prospectId: string }>()
  for (const s of sends) {
    if (!s.thread_id || !open.has(s.prospect_id)) continue
    if (!byThread.has(s.thread_id)) byThread.set(s.thread_id, { sendId: s.id, prospectId: s.prospect_id })
  }
  const { data: due, error: dueError } = await supabase.from('outreach_sends')
    .select('prospect_id')
    .eq('company_id', companyId)
    .eq('status', 'queued')
    .lte('scheduled_at', new Date(Date.now() + 5 * 60_000).toISOString())
  if (dueError) throw dueError
  const dueProspects = new Set((due ?? []).map((s) => s.prospect_id))
  const allThreads = [...byThread.entries()]
  const urgent = allThreads.filter(([, ref]) => dueProspects.has(ref.prospectId))
  const remaining = allThreads.filter(([, ref]) => !dueProspects.has(ref.prospectId))
  if (urgent.length > MAX_THREADS) throw new Error('Too many due threads to check for replies before sending')
  // Rotate the bounded scan so old open threads cannot starve forever.
  const offset = remaining.length ? Math.floor(Date.now() / (SCAN_MIN_INTERVAL_MIN * 60_000)) % remaining.length : 0
  const threads = [...urgent, ...remaining.slice(offset), ...remaining.slice(0, offset)].slice(0, MAX_THREADS)
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
        return { ref, verdict: classifyThread(thread.messages ?? [], creds.emailAddress), failed: false }
      } catch (err) {
        console.warn('[reply-scan] thread dropped:', err instanceof Error ? err.message.split('\n')[0] : err)
        return { ref, verdict: null as Verdict, failed: true }
      }
    },
    INTER_BATCH_PAUSE_MS,
  )
  if (verdicts.some(({ ref, failed }) => failed && dueProspects.has(ref.prospectId))) {
    throw new Error('Could not check a due recipient thread for an opt-out')
  }

  const counts = await applyVerdicts(
    supabase,
    companyId,
    verdicts.map(({ ref, verdict }) => ({ ...ref, email: emailByProspect.get(ref.prospectId) ?? '', verdict })),
  )

  await supabase.from('outreach_settings').update({ last_reply_scan_at: new Date().toISOString() }).eq('company_id', companyId)
  return counts
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

export interface OpenStats {
  /** Sent emails that actually carry a tracking pixel. */
  tracked: number
  /** Of those, how many registered at least one open. */
  opened: number
  rate: number
}

/**
 * Open rate over TRACKABLE sends only.
 *
 * The denominator deliberately excludes sends made before open tracking
 * existed (null open_token). Counting those would report a near-zero open rate
 * forever and hide the signal this metric exists to provide. A dash in the UI
 * until tracked sends accumulate is the honest answer.
 */
export async function openStats(supabase: DB, companyId: string): Promise<OpenStats> {
  const { count: tracked } = await supabase
    .from('outreach_sends')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .not('open_token', 'is', null)
  const { count: opened } = await supabase
    .from('outreach_sends')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .not('open_token', 'is', null)
    .not('opened_at', 'is', null)
  const t = tracked ?? 0
  const o = opened ?? 0
  return { tracked: t, opened: o, rate: t > 0 ? o / t : 0 }
}

export interface ClickStats {
  /** Sent emails whose HTML part carried click-tracked links (same gate as
   * opens: an open token). Rows sent before click tracking existed are in the
   * denominator too, since they carry the token but not the redirect; the
   * `since` cutoff lets the caller exclude them. */
  tracked: number
  clicked: number
  rate: number
}

/** Click rate over tracked sends, optionally only those sent at/after `since`. */
export async function clickStats(supabase: DB, companyId: string, since?: string | null): Promise<ClickStats> {
  let tracked = supabase
    .from('outreach_sends')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .not('open_token', 'is', null)
  let clicked = supabase
    .from('outreach_sends')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .not('open_token', 'is', null)
    .not('clicked_at', 'is', null)
  if (since) {
    tracked = tracked.gte('sent_at', since)
    clicked = clicked.gte('sent_at', since)
  }
  const [{ count: t }, { count: c, error }] = await Promise.all([tracked, clicked])
  // Before the click migration runs the clicked_at column is missing; report
  // zero rather than failing the whole snapshot.
  if (error) return { tracked: t ?? 0, clicked: 0, rate: 0 }
  return { tracked: t ?? 0, clicked: c ?? 0, rate: t ? (c ?? 0) / t : 0 }
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
