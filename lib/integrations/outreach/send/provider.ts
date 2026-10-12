/**
 * Provider-agnostic send interface. Implementations only have to turn a composed
 * message into a delivery + a provider message id. The drip worker, queue, slot
 * scheduling, suppression, and status tracking all live above this seam, so a
 * real provider (Gmail / Resend) plugs in without touching the machinery.
 *
 * The default is a DRY-RUN provider that records a "sent" without emailing —
 * the whole flow is exercisable end-to-end with zero deliverability/ToS risk.
 * Real providers are gated on an acceptable-use check + a dedicated sending
 * domain (see plan), so getProvider() throws for them until implemented.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { sendOutreachEmail } from '../../gmail/send'
import { loadOutlookCredentials } from '../../outlook/tokens'
import { canReadMail, canThreadMail, findMessageByInternetId, findSentCopy, sendMail, sendMailWithRefs, sendReply, type SentMessageRefs } from '../../outlook/fetch'

export type ProviderName = 'dry_run' | 'gmail' | 'outlook' | 'resend'

/** Context a provider may need to act for a specific company (token loading,
 * etc.). The Supabase client lets the cron/service-role path work without an
 * SSR session. */
export interface SendContext {
  companyId: string
  supabase: SupabaseClient<Database>
}

export interface SendMessage {
  to: string
  from: string
  fromName?: string | null
  replyTo?: string | null
  subject: string
  body: string
  /** Threading for follow-ups (reply into an existing conversation). */
  threadId?: string | null
  inReplyTo?: string | null
  references?: string | null
  /** HTML alternative carrying the open-tracking pixel. Omit for plaintext-only. */
  htmlBody?: string | null
  /** RFC 2369 / RFC 8058 unsubscribe headers. */
  listUnsubscribe?: string | null
  listUnsubscribePost?: string | null
}

export interface SendResult {
  ok: boolean
  providerMessageId?: string
  /** Provider thread id + RFC822 Message-ID, persisted so later touches thread. */
  threadId?: string | null
  messageIdHeader?: string | null
  error?: string
}

export interface EmailProvider {
  name: ProviderName
  send(msg: SendMessage): Promise<SendResult>
}

/** Records a send without delivering anything. Safe default for testing. */
const dryRunProvider: EmailProvider = {
  name: 'dry_run',
  async send(msg) {
    // A deterministic-ish fake id; no Math.random (keep server output tidy).
    const id = `dry_${Date.now().toString(36)}_${msg.to.replace(/[^a-z0-9]/gi, '').slice(0, 8)}`
    return { ok: true, providerMessageId: id }
  },
}

/** Sends new outreach emails from the company's connected Gmail mailbox. */
function gmailProvider(ctx: SendContext): EmailProvider {
  return {
    name: 'gmail',
    async send(msg) {
      try {
        const r = await sendOutreachEmail(
          ctx.companyId,
          {
            to: msg.to, subject: msg.subject, body: msg.body, fromName: msg.fromName, replyTo: msg.replyTo,
            threadId: msg.threadId, inReplyTo: msg.inReplyTo, references: msg.references,
            htmlBody: msg.htmlBody, listUnsubscribe: msg.listUnsubscribe, listUnsubscribePost: msg.listUnsubscribePost,
          },
          ctx.supabase,
          msg.from,
        )
        return { ok: true, providerMessageId: r.messageId, threadId: r.threadId, messageIdHeader: r.messageIdHeader }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Gmail send failed' }
      }
    },
  }
}

/**
 * Sends from the company's connected Microsoft 365 mailbox. What it can do
 * depends on the scope the mailbox granted:
 *  - Mail.ReadWrite: draft-then-send, which returns the ids a later touch needs,
 *    and follow-ups go out as true replies (createReply) so they thread.
 *  - Mail.Read only: plain sendMail, then the Sent Items copy is looked up to
 *    recover the ids. Follow-ups cannot thread (Graph's sendMail cannot set
 *    In-Reply-To) and go out as fresh messages.
 *  - Mail.Send only: plain sendMail, no ids.
 */
function outlookProvider(ctx: SendContext): EmailProvider {
  return {
    name: 'outlook',
    async send(msg) {
      try {
        const creds = await loadOutlookCredentials(ctx.companyId, ctx.supabase)
        if (!creds) return { ok: false, error: 'Microsoft 365 mailbox is not connected.' }
        if (msg.from.toLowerCase() !== creds.emailAddress.toLowerCase()) {
          return { ok: false, error: 'Sender email must match the connected Microsoft 365 mailbox.' }
        }
        const mail = { to: msg.to, subject: msg.subject, body: msg.body, htmlBody: msg.htmlBody, replyTo: msg.replyTo }
        let refs: SentMessageRefs | null = null
        if (canThreadMail(creds.scope)) {
          // Thread under the prior touch when we still hold its Message-ID and
          // the mailbox still has it; otherwise a fresh (but id-bearing) send.
          const original = msg.inReplyTo ? await findMessageByInternetId(creds.accessToken, msg.inReplyTo).catch(() => null) : null
          refs = original
            ? await sendReply(creds.accessToken, original.id, mail)
            : await sendMailWithRefs(creds.accessToken, mail)
        } else {
          const sentAt = new Date()
          await sendMail(creds.accessToken, mail)
          if (canReadMail(creds.scope)) refs = await recoverSentRefs(creds.accessToken, mail, sentAt)
        }
        return {
          ok: true,
          providerMessageId: refs?.id ?? undefined,
          threadId: refs?.conversationId ?? null,
          messageIdHeader: refs?.internetMessageId ?? null,
        }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Microsoft send failed' }
      }
    },
  }
}

/** Exchange files the Sent Items copy a moment after sendMail returns; give it
 * a few short tries. Best-effort: a miss just leaves the ids null, and the
 * thread backfill can fill them later. */
async function recoverSentRefs(accessToken: string, mail: { to: string; subject: string }, sentAt: Date): Promise<SentMessageRefs | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt))
    try {
      const refs = await findSentCopy(accessToken, { to: mail.to, subject: mail.subject, sentAt })
      if (refs) return refs
    } catch (err) {
      console.warn('[outlook] sent-copy lookup failed:', err instanceof Error ? err.message : err)
      return null
    }
  }
  return null
}

export function getProvider(name: ProviderName, ctx: SendContext): EmailProvider {
  if (name === 'dry_run') return dryRunProvider
  if (name === 'gmail') return gmailProvider(ctx)
  if (name === 'outlook') return outlookProvider(ctx)
  // TODO(send): Resend — only after the AUP check + dedicated sending domain
  // decision. Until then this is the explicit pluggable seam.
  throw new Error(`Email provider "${name}" is not configured yet.`)
}
