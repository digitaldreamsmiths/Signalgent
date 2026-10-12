/**
 * Provider-neutral inbound-message classification for the reply/bounce
 * scanners. Gmail and Outlook fetch messages in different shapes; both adapt
 * to `InboundMessage` and share these rules so a bounce or an opt-out means
 * the same thing regardless of which mailbox received it.
 */

/** The handful of fields every scanner can cheaply obtain per message. */
export interface InboundMessage {
  from: string
  subject: string
  /** Short body preview (Gmail snippet / Graph bodyPreview). Stored on the
   * prospect, so it should be the clean human-readable version. */
  snippet: string
  /** Optional longer plain-text body used only for classification (a DSN's
   * enhanced status code sits below the preview). Never stored. */
  body?: string
  /** Content-Type header when known; Graph does not expose it on list. */
  contentType?: string
  /** Received timestamp, unix ms. */
  ts: number
}

export const BOUNCE_SUBJECT_RE = /delivery status notification|undeliverable|delivery has failed|mail delivery (failed|subsystem)|returned mail|failure notice|could ?n[o']?t be delivered|was ?n[o']?t delivered|delivery (failure|incomplete)/i
export const BOUNCE_FROM_RE = /mailer-daemon|postmaster|mail delivery (system|subsystem)|microsoftexchange/i

/** Opt-out / unsubscribe intent in a reply's subject or snippet. Deliberately
 * broad — a false positive only suppresses one address (recoverable via Reopen),
 * whereas a false negative means emailing someone who asked us to stop (a
 * CAN-SPAM problem). Matched against the metadata we already fetch. */
export const OPT_OUT_RE = /\b(unsubscrib\w*|opt[\s-]?out|stop|cancel|remove me|remove my (?:name|email)|take me off|take my (?:name|email) off|no longer (?:wish|want|interested)|do ?n[o']?t (?:contact|email|message)|do not (?:contact|email|message)|leave me alone)\b/i

/** True when an inbound (non-bounce) message reads as an opt-out request. */
export function isOptOut(msg: InboundMessage): boolean {
  return OPT_OUT_RE.test(msg.subject) || OPT_OUT_RE.test(msg.snippet)
}

/** RFC 3463 enhanced status code: class 4 = persistent-transient (soft), class
 * 5 = permanent (hard). When present in the DSN text it's the authoritative
 * signal, so it wins over keyword matching. */
const ENH_STATUS_RE = /\b([45])\.\d{1,3}\.\d{1,3}\b/
/** Common transient SMTP reply codes that a DSN quotes without an enhanced code. */
const SOFT_SMTP_RE = /\b(421|450|451|452)\b/
/** Positive signals that a DSN is only a TEMPORARY failure (mailbox full, over
 * quota, delayed/still-retrying, greylisted, rate-limited, connection trouble).
 * We only DEMOTE a bounce to soft on a positive signal like these — anything we
 * can't classify stays a hard bounce, so genuine dead addresses are never
 * undercounted. Soft bounces are excluded from the bounce rate entirely. */
const SOFT_BOUNCE_RE = /\b(temporar\w*|delay(ed)?|will retry|try again|over[\s-]?quota|quota exceeded|mailbox full|full mailbox|message too large|size limit|exceeds? the|rate[\s-]?limit\w*|throttl\w*|greylist\w*|deferred|not yet been delivered|still (being )?(delivered|retried)|connection (timed out|refused|reset|error)|timed out|service (temporarily )?unavailable)\b/i

/** A message is a bounce/DSN if it's from a daemon, looks like a failure
 * notice, or carries a delivery-status report MIME type. */
export function isDSN(msg: InboundMessage): boolean {
  return (
    BOUNCE_FROM_RE.test(msg.from) ||
    BOUNCE_SUBJECT_RE.test(msg.subject) ||
    /multipart\/report|report-type=delivery-status/i.test(msg.contentType ?? '')
  )
}

/** Classify a delivery notice by severity from the subject + snippet we already
 * fetch. Only 'hard' (permanent) bounces count toward the bounce rate; 'soft'
 * covers temporary failures and mere delay notices, which are ignored. 'none'
 * means the message isn't a DSN at all. */
export function bounceKind(msg: InboundMessage): 'hard' | 'soft' | 'none' {
  if (!isDSN(msg)) return 'none'
  const text = `${msg.subject} ${msg.body ?? msg.snippet}`
  const enh = text.match(ENH_STATUS_RE)
  if (enh) return enh[1] === '4' ? 'soft' : 'hard' // enhanced code is authoritative
  if (SOFT_SMTP_RE.test(text) || SOFT_BOUNCE_RE.test(text)) return 'soft'
  return 'hard'
}

export type VerdictKind = 'bounced' | 'replied' | 'unsubscribed' | 'soft_bounce'

export type Verdict =
  | { kind: VerdictKind; at: string; from: string; subject: string; snippet: string }
  | null

/** From/Subject/snippet preview of an inbound message, trimmed so a runaway
 * subject or snippet can't bloat the prospect row. */
export function preview(msg: InboundMessage): { from: string; subject: string; snippet: string } {
  return {
    from: msg.from.slice(0, 320),
    subject: msg.subject.slice(0, 320),
    snippet: msg.snippet.trim().slice(0, 500),
  }
}

/** Reduce the inbound messages attributed to one prospect to a single outcome.
 * Precedence: hard bounce > opt-out > plain reply > soft bounce. The chosen
 * message is the earliest matching one. An opt-out anywhere wins over a neutral
 * reply so a "stop emailing me" is never downgraded to a normal reply. A soft
 * bounce ranks last so a genuine human reply always wins over a temporary
 * delivery notice; the caller counts it without acting. Callers must already
 * have filtered out our own outbound mail and drafts. */
export function classifyInbound(messages: InboundMessage[]): Verdict {
  let bounce: InboundMessage | null = null
  let soft: InboundMessage | null = null
  let optout: InboundMessage | null = null
  let reply: InboundMessage | null = null

  for (const m of messages) {
    const kind = bounceKind(m)
    if (kind === 'hard') {
      if (bounce === null || m.ts < bounce.ts) bounce = m
      continue
    }
    if (kind === 'soft') {
      if (soft === null || m.ts < soft.ts) soft = m
      continue
    }
    if (reply === null || m.ts < reply.ts) reply = m
    if (isOptOut(m) && (optout === null || m.ts < optout.ts)) optout = m
  }

  if (bounce) return { kind: 'bounced', at: new Date(bounce.ts).toISOString(), ...preview(bounce) }
  if (optout) return { kind: 'unsubscribed', at: new Date(optout.ts).toISOString(), ...preview(optout) }
  if (reply) return { kind: 'replied', at: new Date(reply.ts).toISOString(), ...preview(reply) }
  if (soft) return { kind: 'soft_bounce', at: new Date(soft.ts).toISOString(), ...preview(soft) }
  return null
}
