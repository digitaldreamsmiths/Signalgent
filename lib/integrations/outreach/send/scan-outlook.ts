/**
 * Outlook (Microsoft Graph) reply / bounce scanner.
 *
 * Inbox-driven rather than thread-driven: Graph's sendMail returns no message
 * or conversation id, so unlike Gmail we own no thread handle per send. Instead
 * we list everything the mailbox received since the first send in the window
 * and attribute each message back to an open prospect:
 *
 *   - a message FROM a prospect's address is that prospect's reply / opt-out;
 *   - a delivery notice (postmaster / Exchange DSN) names the failed recipient
 *     only in its body, so for those we fetch the plain-text body and match
 *     every address in it against the open prospects;
 *   - failing an exact address, a reply-shaped message (Re:, auto-reply, or one
 *     quoting our mail) or a DSN address whose domain belongs to exactly ONE
 *     open prospect is attributed to that prospect. Church offices routinely
 *     forward office@ to a named person who answers from their own address,
 *     and a forwarding loop bounces from the forwarded-to address, not the one
 *     we sent to. Free-mail domains are excluded from this fallback.
 *
 * Everything else (newsletters, unrelated mail, replies from an address we
 * never emailed) is ignored and counted as unmatched. Classification and the
 * write path are shared with the Gmail scanner (classify.ts / apply.ts), so a
 * bounce or opt-out means the same thing for both providers.
 *
 * Reads all folders, not just Inbox: a bounce the user already deleted, or a
 * reply Outlook filed under Junk, still has to suppress the prospect.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { loadOutlookCredentials } from '@/lib/integrations/outlook/tokens'
import {
  getMessageText,
  hasOutlookScope,
  isGraphForbidden,
  listMessagesSince,
  OUTLOOK_READ_SCOPE,
  type GraphMessage,
} from '@/lib/integrations/outlook/fetch'
import { classifyInbound, isDSN, type InboundMessage } from './classify'
import { applyVerdicts, type ScanVerdict } from './apply'
import type { ScanResult } from './scan'

type DB = SupabaseClient<Database>

/** Incremental scans re-read this much before the last scan so a message that
 * arrived while the previous pass was running is never skipped. */
const RESCAN_OVERLAP_MS = 24 * 3600_000
/** Graph pages of 100; 20 pages bounds one pass at 2,000 messages. */
const MAX_PAGES = 20
/** Delivery notices need a body fetch each; cap per pass for bounded latency. */
const MAX_DSN_BODIES = 150
/** How much DSN body text to classify against (enhanced status codes and the
 * failed address both sit near the top). */
const DSN_TEXT_CHARS = 4000

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
/** Shared mailbox providers where a domain says nothing about who sent it. */
const FREEMAIL_RE = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|comcast|bellsouth|att|sbcglobal|verizon|cox|charter|earthlink|protonmail|proton|myfairpoint|windstream|frontier|juno|netzero)\.(com|net|org|me)$/i
/** A message that reads as a reply to ours even though the sender differs. */
const REPLY_SHAPED_RE = /^\s*(re|aw|fw|fwd)\s*:|automatic reply|auto-?reply|out of (the )?office|away from the office|requires verification/i

const normalize = (email: string) => email.trim().toLowerCase()
const domainOf = (email: string) => normalize(email).split('@')[1] ?? ''

function fromLine(m: GraphMessage): string {
  const ea = m.from?.emailAddress ?? m.sender?.emailAddress
  const address = ea?.address ?? ''
  const name = ea?.name ?? ''
  return name && address ? `${name} <${address}>` : address || name
}

function fromAddress(m: GraphMessage): string {
  return normalize(m.from?.emailAddress?.address ?? m.sender?.emailAddress?.address ?? '')
}

function toInbound(m: GraphMessage, body?: string): InboundMessage {
  const ts = m.receivedDateTime ? Date.parse(m.receivedDateTime) : NaN
  return {
    from: fromLine(m),
    subject: m.subject ?? '',
    snippet: m.bodyPreview ?? '',
    body,
    ts: Number.isFinite(ts) ? ts : 0,
  }
}

/** Graph wants a plain ISO-8601 instant without fractional seconds. */
function graphInstant(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export interface OutlookScanOptions {
  /** Earliest send to consider (lookback window ∩ warmup start). */
  since: string
  senderEmail: string
  lastScanAt: string | null
  force?: boolean
  /** Classify and report, but write nothing (backfill preview). */
  dryRun?: boolean
}

export async function scanOutlookReplies(supabase: DB, companyId: string, opts: OutlookScanOptions): Promise<ScanResult> {
  const none = (skipped: string): ScanResult => ({ replied: 0, bounced: 0, unsubscribed: 0, skipped })

  const creds = await loadOutlookCredentials(companyId, supabase)
  if (!creds) return none('outlook not connected')
  if (normalize(creds.emailAddress) !== normalize(opts.senderEmail)) {
    return none('connected mailbox does not match the sender email')
  }
  if (!hasOutlookScope(creds.scope, OUTLOOK_READ_SCOPE)) {
    return none('reconnect the Microsoft 365 mailbox to allow reading replies (Mail.Read)')
  }

  // Sent mail in the window, newest first, so the first send seen per prospect
  // is the latest one (the one a reply or bounce most likely refers to).
  const { data: sends, error: sendsError } = await supabase
    .from('outreach_sends')
    .select('id, prospect_id, recipient_email, sent_at')
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .gte('sent_at', opts.since)
    .order('sent_at', { ascending: false })
  if (sendsError) throw sendsError
  if (!sends || sends.length === 0) {
    if (!opts.dryRun) await touchScanTime(supabase, companyId)
    return none('no sent emails')
  }

  const prospectIds = [...new Set(sends.map((s) => s.prospect_id))]
  const { data: prospects, error: prospectsError } = await supabase
    .from('outreach_prospects')
    .select('id, email, disposition')
    .eq('company_id', companyId)
    .in('id', prospectIds)
  if (prospectsError) throw prospectsError
  const openProspect = new Map((prospects ?? []).filter((p) => p.disposition === 'open').map((p) => [p.id, p]))

  // address -> the latest send to that still-open prospect.
  const byEmail = new Map<string, { sendId: string; prospectId: string; email: string }>()
  let earliestSentAt = Number.POSITIVE_INFINITY
  for (const s of sends) {
    const p = openProspect.get(s.prospect_id)
    if (!p) continue
    const key = normalize(p.email || s.recipient_email)
    if (!byEmail.has(key)) byEmail.set(key, { sendId: s.id, prospectId: p.id, email: p.email || s.recipient_email })
    if (s.sent_at) earliestSentAt = Math.min(earliestSentAt, Date.parse(s.sent_at))
  }
  if (byEmail.size === 0) {
    if (!opts.dryRun) await touchScanTime(supabase, companyId)
    return none('no open prospects')
  }
  // Domain fallback: only unambiguous (one open prospect) non-freemail domains.
  const byDomain = new Map<string, { sendId: string; prospectId: string; email: string } | null>()
  for (const [key, ref] of byEmail) {
    const d = domainOf(key)
    if (!d || FREEMAIL_RE.test(d)) continue
    byDomain.set(d, byDomain.has(d) ? null : ref)
  }
  const mineDomain = domainOf(opts.senderEmail)
  const resolve = (address: string) => {
    const key = normalize(address)
    const direct = byEmail.get(key)
    if (direct) return direct
    const d = domainOf(key)
    if (!d || d === mineDomain) return undefined
    return byDomain.get(d) ?? undefined
  }

  // Nothing can arrive before the first open send went out; on incremental
  // passes also skip what the previous pass already read (minus an overlap).
  let listFrom = Number.isFinite(earliestSentAt) ? earliestSentAt : Date.parse(opts.since)
  if (!opts.force && opts.lastScanAt) {
    listFrom = Math.max(listFrom, Date.parse(opts.lastScanAt) - RESCAN_OVERLAP_MS)
  }

  let messages: GraphMessage[]
  try {
    messages = await listMessagesSince(creds.accessToken, {
      since: graphInstant(new Date(listFrom).toISOString()),
      pageSize: 100,
      maxPages: MAX_PAGES,
    })
  } catch (err) {
    if (isGraphForbidden(err)) return none('reconnect the Microsoft 365 mailbox to allow reading replies (Mail.Read)')
    throw err
  }

  const mine = normalize(creds.emailAddress)
  const perProspect = new Map<string, InboundMessage[]>()
  const push = (prospectId: string, msg: InboundMessage) => {
    const list = perProspect.get(prospectId)
    if (list) list.push(msg)
    else perProspect.set(prospectId, [msg])
  }

  let unmatched = 0
  let dsnBodies = 0
  for (const m of messages) {
    if (m.isDraft) continue
    const from = fromAddress(m)
    if (!from || from === mine) continue // our own outbound / self

    const direct = byEmail.get(from)
    if (direct) {
      push(direct.prospectId, toInbound(m))
      continue
    }

    const probe = toInbound(m)
    if (!isDSN(probe)) {
      const quotesUs = probe.snippet.toLowerCase().includes(mine)
      const viaDomain = REPLY_SHAPED_RE.test(probe.subject) || quotesUs ? resolve(from) : undefined
      if (viaDomain) push(viaDomain.prospectId, probe)
      else unmatched++
      continue
    }

    // Delivery notice: the failed recipient is only in the body.
    let text = m.bodyPreview ?? ''
    if (dsnBodies < MAX_DSN_BODIES) {
      dsnBodies++
      try {
        text = (await getMessageText(creds.accessToken, m.id)).slice(0, DSN_TEXT_CHARS)
      } catch (err) {
        console.warn('[reply-scan:outlook] DSN body fetch failed:', err instanceof Error ? err.message.split('\n')[0] : err)
      }
    }
    const hits = new Map<string, { sendId: string; prospectId: string; email: string }>()
    for (const addr of text.match(EMAIL_RE) ?? []) {
      const key = normalize(addr)
      if (key === mine) continue
      const ref = resolve(key)
      if (ref) hits.set(ref.prospectId, ref)
    }
    if (hits.size === 0) {
      unmatched++
      continue
    }
    for (const ref of hits.values()) push(ref.prospectId, toInbound(m, text))
  }

  const items: ScanVerdict[] = []
  for (const [prospectId, inbound] of perProspect) {
    const ref = [...byEmail.values()].find((r) => r.prospectId === prospectId)
    if (!ref) continue
    const verdict = classifyInbound(inbound)
    if (verdict) items.push({ ...ref, verdict })
  }

  const details = items.map((i) => ({
    email: i.email,
    kind: i.verdict!.kind,
    at: i.verdict!.at,
    from: i.verdict!.from,
    subject: i.verdict!.subject,
  }))

  if (opts.dryRun) {
    const counts = { replied: 0, bounced: 0, unsubscribed: 0, softBounced: 0 }
    for (const i of items) {
      if (i.verdict!.kind === 'soft_bounce') counts.softBounced++
      else counts[i.verdict!.kind]++
    }
    return { ...counts, scanned: messages.length, unmatched, details }
  }

  const counts = await applyVerdicts(supabase, companyId, items)
  await touchScanTime(supabase, companyId)
  return { ...counts, scanned: messages.length, unmatched, details }
}

async function touchScanTime(supabase: DB, companyId: string): Promise<void> {
  await supabase.from('outreach_settings').update({ last_reply_scan_at: new Date().toISOString() }).eq('company_id', companyId)
}
