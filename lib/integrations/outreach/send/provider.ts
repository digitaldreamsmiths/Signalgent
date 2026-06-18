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

export type ProviderName = 'dry_run' | 'gmail' | 'resend'

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
}

export interface SendResult {
  ok: boolean
  providerMessageId?: string
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
          { to: msg.to, subject: msg.subject, body: msg.body, fromName: msg.fromName, replyTo: msg.replyTo },
          ctx.supabase,
        )
        return { ok: true, providerMessageId: r.messageId }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Gmail send failed' }
      }
    },
  }
}

export function getProvider(name: ProviderName, ctx: SendContext): EmailProvider {
  if (name === 'dry_run') return dryRunProvider
  if (name === 'gmail') return gmailProvider(ctx)
  // TODO(send): Resend — only after the AUP check + dedicated sending domain
  // decision. Until then this is the explicit pluggable seam.
  throw new Error(`Email provider "${name}" is not configured yet.`)
}
