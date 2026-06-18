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

export type ProviderName = 'dry_run' | 'gmail' | 'resend'

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

export function getProvider(name: ProviderName): EmailProvider {
  if (name === 'dry_run') return dryRunProvider
  // TODO(send): implement Gmail (Google Workspace API, reuse the dormant gmail
  // integration) and/or Resend — only after the AUP check + dedicated sending
  // domain decision. Until then this is the explicit pluggable seam.
  throw new Error(`Email provider "${name}" is not configured yet.`)
}
