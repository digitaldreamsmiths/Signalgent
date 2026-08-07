'use server'

import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import { getAccount } from '@/lib/integrations/accounts'
import { loadSettings } from './send/worker'
import { isConsumerDomain } from './dns-check'

/**
 * Setup checklist — Phase 2 of docs/specs/signalgent-govcon-v1.md.
 *
 * A new user lands on a dense workspace with ten tabs and no idea what order
 * to do things in. This computes the six things that must be true before a
 * first email can go out, so the UI can show what's done and what's next.
 *
 * Deliberately CHEAP: no DNS lookups, no page-load cost beyond a handful of
 * indexed reads. The one deliverability signal it can derive for free is
 * "you're sending from a consumer mailbox domain" (a pure string check); the
 * full SPF/DKIM/DMARC preflight stays behind its own button in Sending
 * settings.
 */

export type StepState = 'done' | 'todo' | 'warn'

export interface SetupStep {
  key: 'offer' | 'mailbox' | 'identity' | 'auth' | 'prospects' | 'sending'
  title: string
  /** One line on why this matters — teach, don't just list. */
  why: string
  state: StepState
  /** Short status shown next to the title when known. */
  detail?: string
  /** Which surface fixes it; the workspace maps this to a button. */
  action?: 'offer_profile' | 'connections' | 'sending_settings' | 'add_prospects'
}

export interface SetupStatus {
  steps: SetupStep[]
  /** True once every step is 'done' — the checklist hides itself. */
  complete: boolean
}

export async function getSetupStatus(companyId: string): Promise<SetupStatus | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }
  const supabase = await createClient()

  const [settings, profileRow, prospectCount, gmail] = await Promise.all([
    loadSettings(supabase, companyId),
    supabase.from('outreach_offer_profiles').select('company_id').eq('company_id', companyId).maybeSingle().then((r) => r.data),
    supabase.from('outreach_prospects').select('id', { count: 'exact', head: true }).eq('company_id', companyId).then((r) => r.count ?? 0),
    getAccount(companyId, 'gmail').catch(() => null),
  ])

  const senderEmail = settings.sender_email?.trim() ?? ''
  const senderDomain = senderEmail.split('@')[1]?.trim() ?? ''
  const mailboxReady = settings.provider === 'dry_run' || gmail?.status === 'connected'

  const steps: SetupStep[] = [
    {
      key: 'offer',
      title: 'Describe what you sell',
      why: 'Every email is written from this. Without it, drafts pitch the built-in example instead of your offer.',
      state: profileRow ? 'done' : 'todo',
      detail: profileRow ? 'Saved' : undefined,
      action: 'offer_profile',
    },
    {
      key: 'mailbox',
      title: 'Connect a mailbox',
      why: 'Email sends from your own mailbox, so replies land in your inbox and threads stay together.',
      state: mailboxReady ? 'done' : 'todo',
      detail: settings.provider === 'dry_run' ? 'Dry run (nothing is actually sent)' : gmail?.status === 'connected' ? 'Gmail connected' : gmail ? `Gmail ${gmail.status}` : 'Not connected',
      action: 'connections',
    },
    {
      key: 'identity',
      title: 'Set your sender details',
      why: 'The from-address, plus the mailing address every commercial email is legally required to carry.',
      state: senderEmail && settings.physical_address?.trim() ? 'done' : 'todo',
      detail: !senderEmail ? 'No sender email' : !settings.physical_address?.trim() ? 'Missing mailing address (CAN-SPAM)' : senderEmail,
      action: 'sending_settings',
    },
    {
      key: 'auth',
      title: 'Authenticate your domain',
      why: 'Receivers check SPF, DKIM, and DMARC to decide whether your mail is real. Unauthenticated cold email goes to spam.',
      ...(senderDomain && isConsumerDomain(senderDomain)
        ? {
            state: 'warn' as const,
            detail: `${senderDomain} is a consumer mailbox — it can't be authenticated`,
          }
        : { state: 'todo' as const, detail: senderDomain ? `Run the checks for ${senderDomain}` : 'Set a sender email first' }),
      action: 'sending_settings',
    },
    {
      key: 'prospects',
      title: 'Add prospects',
      why: 'Paste or upload a list of contact emails. Enrichment researches each one and drafts the email.',
      state: prospectCount > 0 ? 'done' : 'todo',
      detail: prospectCount > 0 ? `${prospectCount.toLocaleString('en-US')} added` : undefined,
      action: 'add_prospects',
    },
    {
      key: 'sending',
      title: 'Turn on sending',
      why: 'The master switch. Off, nothing leaves the queue no matter what else is configured.',
      state: settings.active ? 'done' : 'todo',
      detail: settings.active ? 'On' : settings.pause_reason === 'bounce_rate' ? 'Auto-paused on bounce rate' : 'Off',
      action: 'sending_settings',
    },
  ]

  // 'auth' can only ever reach 'todo' or 'warn' from cheap signals, so it never
  // blocks completion on its own — the full preflight lives behind its button.
  const complete = steps.every((s) => s.state === 'done' || s.key === 'auth')
  return { steps, complete }
}
