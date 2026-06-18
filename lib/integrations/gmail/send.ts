/**
 * High-level Gmail send + archive operations.
 *
 * Wraps the raw Gmail API primitives (modifyThreadLabels, sendMessage)
 * with credential loading, MIME assembly, and reply-header threading.
 *
 * Why this isn't in `fetch.ts`: fetch.ts is supposed to be HTTP-only —
 * no DB access, no credential loading. Send needs both: it has to read
 * the last message's headers (for In-Reply-To / References) AND it has
 * to know the mailbox owner's address (for the From header). Keeping
 * the orchestration here keeps fetch.ts pure.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { loadGmailCredentials } from './tokens'
import {
  getMessage,
  getThread,
  modifyThreadLabels,
  sendMessage,
  type GmailHeader,
} from './fetch'
import { invalidateCommunicationsSnapshot } from './snapshot'
import { base64UrlEncode, buildMessageMime } from './mime'

export interface SendReplyArgs {
  companyId: string
  threadId: string
  /** Plain-text body of the reply. */
  body: string
}

export interface SendReplyResult {
  messageId: string
  threadId: string
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null
  const hit = headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
  return hit?.value ?? null
}

/**
 * Pick the most recent message in the thread that wasn't sent by the
 * mailbox owner. That's the one we're replying TO. Falls back to the
 * absolute last message if everything is owner-sent (shouldn't happen
 * in practice but defensive).
 */
function pickReplyTarget(messages: Array<{ labelIds?: string[] }>): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const labels = messages[i].labelIds ?? []
    if (!labels.includes('SENT')) return i
  }
  return messages.length - 1
}

function reSubject(subject: string | null): string {
  const trimmed = (subject ?? '').trim()
  if (!trimmed) return 'Re:'
  if (/^re:/i.test(trimmed)) return trimmed
  return `Re: ${trimmed}`
}

function buildReplyMime(args: {
  from: string
  to: string
  subject: string
  inReplyTo: string | null
  references: string | null
  body: string
}): string {
  const lines = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ]
  if (args.inReplyTo) lines.push(`In-Reply-To: ${args.inReplyTo}`)
  if (args.references) lines.push(`References: ${args.references}`)
  lines.push('') // blank line separating headers from body
  lines.push(args.body)
  return lines.join('\r\n')
}

export async function sendReply(args: SendReplyArgs): Promise<SendReplyResult> {
  const creds = await loadGmailCredentials(args.companyId)
  if (!creds) {
    throw new Error('Gmail is not connected for this company.')
  }
  if (!args.body.trim()) {
    throw new Error('Reply body is empty.')
  }

  // Pull headers from the thread so we can build proper In-Reply-To /
  // References + know who to address.
  const thread = await getThread({
    accessToken: creds.accessToken,
    id: args.threadId,
    format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Message-ID', 'References'],
  })
  if (!thread.messages || thread.messages.length === 0) {
    throw new Error('Thread has no messages to reply to.')
  }

  const idx = pickReplyTarget(thread.messages)
  const target = thread.messages[idx]
  const headers = target.payload?.headers

  const targetMessageId = headerValue(headers, 'Message-ID')
  const targetReferences = headerValue(headers, 'References')
  const targetFrom = headerValue(headers, 'From')
  const targetSubject = headerValue(headers, 'Subject')

  if (!targetFrom) {
    throw new Error('Reply target is missing a From header.')
  }

  const references = [targetReferences, targetMessageId]
    .filter(Boolean)
    .join(' ')
    .trim()

  const mime = buildReplyMime({
    from: creds.emailAddress,
    to: targetFrom,
    subject: reSubject(targetSubject),
    inReplyTo: targetMessageId,
    references: references || null,
    body: args.body,
  })

  const result = await sendMessage({
    accessToken: creds.accessToken,
    rawBase64Url: base64UrlEncode(mime),
    threadId: args.threadId,
  })

  // The sent message lives in the same thread but won't be in our
  // snapshot until we rebuild — drop the cache so the next snapshot
  // read reflects the reply.
  await invalidateCommunicationsSnapshot(args.companyId)

  return { messageId: result.id, threadId: result.threadId }
}

// ── New-message send (outreach) ───────────────────────────────────────────────

export interface SendOutreachArgs {
  to: string
  subject: string
  body: string
  /** Display name for the From header (address is always the connected mailbox). */
  fromName?: string | null
  replyTo?: string | null
  /** Threading for follow-ups: reply into an existing Gmail thread. */
  threadId?: string | null
  inReplyTo?: string | null
  references?: string | null
}

export interface SendOutreachResult {
  messageId: string
  threadId: string
  /** The sent message's RFC822 Message-ID header (for threading later touches). */
  messageIdHeader: string | null
}

/**
 * Send a NEW outreach email (not a reply) from the company's connected Gmail
 * mailbox. Gmail only sends as the authenticated account, so the From address is
 * always the connected mailbox; `fromName` becomes the display name. Accepts an
 * optional Supabase client so the cron/service-role path can load credentials
 * without an SSR session.
 */
export async function sendOutreachEmail(
  companyId: string,
  args: SendOutreachArgs,
  client?: SupabaseClient<Database>,
): Promise<SendOutreachResult> {
  const creds = await loadGmailCredentials(companyId, client)
  if (!creds) throw new Error('Gmail is not connected for this company.')
  if (!args.to.trim()) throw new Error('Recipient email is empty.')
  if (!args.body.trim()) throw new Error('Email body is empty.')

  const from = args.fromName?.trim() ? `${args.fromName.trim()} <${creds.emailAddress}>` : creds.emailAddress
  const mime = buildMessageMime({
    from,
    to: args.to,
    subject: args.subject,
    replyTo: args.replyTo?.trim() || null,
    body: args.body,
    inReplyTo: args.inReplyTo ?? null,
    references: args.references ?? null,
  })
  const result = await sendMessage({
    accessToken: creds.accessToken,
    rawBase64Url: base64UrlEncode(mime),
    threadId: args.threadId ?? undefined,
  })

  // Read back the RFC822 Message-ID so later touches can thread under this one.
  let messageIdHeader: string | null = null
  try {
    const msg = await getMessage({ accessToken: creds.accessToken, id: result.id, format: 'metadata', metadataHeaders: ['Message-ID'] })
    messageIdHeader = headerValue(msg.payload?.headers, 'Message-ID')
  } catch {
    // Non-fatal: threading just won't chain off this message.
  }

  return { messageId: result.id, threadId: result.threadId, messageIdHeader }
}

export async function archiveThread(args: {
  companyId: string
  threadId: string
}): Promise<void> {
  const creds = await loadGmailCredentials(args.companyId)
  if (!creds) {
    throw new Error('Gmail is not connected for this company.')
  }
  await modifyThreadLabels({
    accessToken: creds.accessToken,
    threadId: args.threadId,
    removeLabelIds: ['INBOX'],
  })
  await invalidateCommunicationsSnapshot(args.companyId)
}
