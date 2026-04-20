/**
 * Gmail → CommunicationsSnapshot normalizer.
 *
 * Given a batch of Gmail message metadata (already fetched) plus the
 * profile and some aggregate counts, produce a CommunicationsSnapshot
 * that the widgets can consume.
 *
 * Priority heuristic for v1 — we don't yet have LLM triage, so we lean
 * on Gmail's own labels:
 *   - IMPORTANT or STARRED          → 'urgent'
 *   - CATEGORY_PROMOTIONS, SOCIAL,
 *     UPDATES, FORUMS               → 'low'
 *   - otherwise                     → 'opportunity'
 *
 * The responseRate and avgResponseTimeHours fields are left null here.
 * They're computed by lib/integrations/gmail/responseStats.ts (per-thread
 * traversal + Sent-label matching) and overlaid in snapshot.ts after
 * normalize runs. Widgets fall back to mock if the overlay also fails.
 */

import type {
  CommunicationsMessage,
  CommunicationsSnapshot,
} from '../comms/model'
import type { GmailHeader, GmailMessage, GmailProfile } from './fetch'

interface NormalizeInput {
  /** Gmail `users.getProfile` result — provides emailAddress. */
  profile: GmailProfile
  /** Message metadata for inbox messages, newest first. */
  messages: GmailMessage[]
  /** Total unread count (from a separate list call with q='is:unread in:inbox'). */
  totalUnread: number
  /**
   * Distinct thread count for the last 7 days (from a separate list call
   * with q='newer_than:7d in:inbox'). Caller computes as unique threadIds.
   */
  threadsActive: number
  /** Override for testing. */
  now?: Date
}

function getHeader(headers: GmailHeader[], name: string): string | null {
  const hit = headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
  return hit?.value ?? null
}

/**
 * Parse an RFC 5322 From header into name + email.
 *
 *   "Jane Doe" <jane@example.com>   → { name: 'Jane Doe', email: 'jane@example.com' }
 *   Jane Doe <jane@example.com>     → { name: 'Jane Doe', email: 'jane@example.com' }
 *   jane@example.com                → { name: null,       email: 'jane@example.com' }
 */
function parseFrom(raw: string | null): { name: string | null; email: string } {
  if (!raw) return { name: null, email: 'unknown' }
  const trimmed = raw.trim()
  const angleMatch = trimmed.match(/^(.*?)<([^>]+)>\s*$/)
  if (angleMatch) {
    const rawName = angleMatch[1].trim().replace(/^"(.*)"$/, '$1').trim()
    const email = angleMatch[2].trim()
    return { name: rawName || null, email }
  }
  // Bare email
  return { name: null, email: trimmed }
}

function priorityFromLabels(labelIds: string[] | undefined): CommunicationsMessage['priority'] {
  const labels = labelIds ?? []
  if (labels.includes('IMPORTANT') || labels.includes('STARRED')) return 'urgent'
  if (
    labels.includes('CATEGORY_PROMOTIONS') ||
    labels.includes('CATEGORY_SOCIAL') ||
    labels.includes('CATEGORY_UPDATES') ||
    labels.includes('CATEGORY_FORUMS')
  ) {
    return 'low'
  }
  return 'opportunity'
}

function tagFromMessage(labelIds: string[] | undefined, unread: boolean): string {
  const labels = labelIds ?? []
  if (labels.includes('STARRED')) return 'Starred'
  if (labels.includes('IMPORTANT')) return 'Important'
  if (unread && labels.includes('CATEGORY_PROMOTIONS')) return 'Promo'
  if (unread) return 'Unread'
  return 'Can wait'
}

function receivedAtIso(internalDate: string): string {
  const ms = Number(internalDate)
  if (!Number.isFinite(ms)) return new Date().toISOString()
  return new Date(ms).toISOString()
}

function decodeSnippet(snippet: string): string {
  // Gmail snippets are already plaintext but include HTML entities.
  return snippet
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

export function normalizeToSnapshot(input: NormalizeInput): CommunicationsSnapshot {
  const now = input.now ?? new Date()

  const messages: CommunicationsMessage[] = input.messages.map((m) => {
    const headers = m.payload?.headers ?? []
    const from = parseFrom(getHeader(headers, 'From'))
    const subject = getHeader(headers, 'Subject') ?? '(no subject)'
    const unread = (m.labelIds ?? []).includes('UNREAD')

    return {
      id: m.id,
      sender: from,
      subject,
      snippet: decodeSnippet(m.snippet ?? ''),
      receivedAt: receivedAtIso(m.internalDate),
      unread,
      priority: priorityFromLabels(m.labelIds),
      tag: tagFromMessage(m.labelIds, unread),
      triagedPriority: null,
    }
  })

  // Newest first (defensive — Gmail API returns in this order already).
  messages.sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))

  return {
    generatedAt: now.toISOString(),
    mailbox: { emailAddress: input.profile.emailAddress },
    totalUnread: input.totalUnread,
    threadsActive: input.threadsActive,
    responseRate: null,
    avgResponseTimeHours: null,
    messages,
    priorityBreakdown: null,
  }
}
