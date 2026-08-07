'use server'

import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import { loadSettings } from './send/worker'
import { checkSendingDomain, type DomainCheck } from './dns-check'
import type { ActionResult } from './types'

const AUTH_ERROR = 'You don’t have access to this workspace.'

/**
 * Run the deliverability preflight for the company's configured sender domain.
 * Read-only (DNS lookups + a settings read), so it is safe to call on demand
 * from the Sending settings modal.
 */
export async function checkDeliverability(companyId: string): Promise<ActionResult<DomainCheck>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const settings = await loadSettings(supabase, companyId)
  const email = settings.sender_email?.trim()
  const domain = email?.split('@')[1]?.trim()
  if (!domain) {
    return { ok: false, error: 'Set a sender email first — the checks run against its domain.' }
  }
  const check = await checkSendingDomain(domain, process.env.NEXT_PUBLIC_APP_URL, { provider: settings.provider })
  return { ok: true, data: check }
}
