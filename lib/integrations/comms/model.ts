/**
 * Normalized communications data shape.
 *
 * Widgets read this, never raw provider responses. Provider-specific
 * normalizers (e.g. lib/integrations/gmail/normalize.ts) build a
 * CommunicationsSnapshot from whatever shape the provider returns.
 *
 * A CommunicationsSnapshot always has the same fields regardless of
 * provider. When a field cannot be derived for a given provider, it is
 * set to null and widgets render a graceful fallback. MockData also
 * conforms to this shape so mock vs live is a single switch, not a
 * data-shape divergence.
 */

/** One message surfaced in the email list / preview. */
export interface CommunicationsMessage {
  /** Provider-assigned ID — opaque to widgets. */
  id: string
  /** Sender display info. `name` may be null when only an email address is known. */
  sender: {
    name: string | null
    email: string
  }
  subject: string
  /** Plaintext preview — already truncated by the provider (Gmail: ~200 chars). */
  snippet: string
  /** ISO 8601 received time. */
  receivedAt: string
  unread: boolean
  /**
   * Broad priority bucket. Heuristic-derived from provider labels for v1
   * (Gmail IMPORTANT/STARRED → urgent, CATEGORY_UPDATES/PROMOTIONS → low,
   * otherwise opportunity). Kept as the fallback when LLM triage is
   * unavailable.
   */
  priority: 'urgent' | 'opportunity' | 'low'
  /** Short human-readable label shown on the card (e.g. "Urgent", "Can wait"). */
  tag: string
  /**
   * LLM-triaged bucket for the unread-summary / priority-breakdown widgets.
   * Null when triage was skipped (no API key, error, or non-unread message
   * not included in the triage batch).
   */
  triagedPriority: 'urgent' | 'opportunity' | 'canWait' | null
}

/**
 * Count of messages in each triaged bucket. Computed over the recent
 * messages the normalizer pulled, not the whole inbox. Null when triage
 * didn't run (no API key, upstream error).
 */
export interface PriorityBreakdown {
  urgent: number
  opportunity: number
  canWait: number
}

export interface CommunicationsSnapshot {
  /** When this snapshot was computed. */
  generatedAt: string
  /** The authenticated mailbox — drives the connection chip label. */
  mailbox: {
    emailAddress: string
  }
  /** Total unread messages in the inbox. */
  totalUnread: number
  /** Distinct threads with any message in the last 7 days. */
  threadsActive: number
  /**
   * Percent of inbound messages (last 30d) that received a reply from the
   * mailbox owner. Null when we choose not to compute it — widgets fall
   * back to mock for that stat.
   */
  responseRate: number | null
  /**
   * Average time (in hours) between an inbound message and the mailbox
   * owner's first reply on that thread, last 30d. Null when unknown.
   */
  avgResponseTimeHours: number | null
  /** Recent messages, newest first. Capped by the normalizer. */
  messages: CommunicationsMessage[]
  /**
   * Count of recent messages in each LLM-triaged bucket. Null when triage
   * didn't run — widgets fall back to mock.
   */
  priorityBreakdown: PriorityBreakdown | null
}
