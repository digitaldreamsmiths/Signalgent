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
  /** Provider-assigned message ID — opaque to widgets. */
  id: string
  /**
   * Provider-assigned thread ID. Multiple messages in the same conversation
   * share this. Drives the summarize / draft-reply flows (LLM reads the
   * whole thread, not just the selected message).
   */
  threadId: string
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
   * Per-thread response rate over the last 30d: of threads that had at
   * least one inbound message in the window, the percent for which the
   * mailbox owner sent at least one reply afterward. Null when we choose
   * not to compute it or upstream traversal failed — widgets fall back to
   * mock for that stat.
   */
  responseRate: number | null
  /**
   * Average time (in hours) between the first inbound message in a thread
   * and the mailbox owner's first subsequent reply, averaged across
   * responded threads in the last 30d window. Null when unknown.
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
