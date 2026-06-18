'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import type { ActionResult, SendSettings } from './types'
import { composeEmail } from './send/compose'
import { loadSettings, nextSlot, runQueue } from './send/worker'

const AUTH_ERROR = 'You don’t have access to this workspace.'

export async function getSendSettings(companyId: string): Promise<SendSettings | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }
  const supabase = await createClient()
  return loadSettings(supabase, companyId)
}

export async function saveSendSettings(
  companyId: string,
  patch: Partial<SendSettings>,
): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_settings')
    .upsert({ company_id: companyId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'company_id' })
  if (error) return { ok: false, error: 'Could not save sending settings.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

/** Queue a draft (touch) for sending at the next available drip slot. */
export async function queueDraftSend(companyId: string, draftId: string): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()

  const settings = await loadSettings(supabase, companyId)
  if (!settings.active) return { ok: false, error: 'Turn on sending in Sending settings first.' }
  if (!settings.sender_email?.trim()) return { ok: false, error: 'Set a sender email in Sending settings first.' }

  const { data: draft } = await supabase
    .from('outreach_drafts')
    .select('id, subject, body, prospect_id')
    .eq('id', draftId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!draft) return { ok: false, error: 'Draft not found.' }

  const { data: prospect } = await supabase
    .from('outreach_prospects')
    .select('email, disposition')
    .eq('id', draft.prospect_id)
    .maybeSingle()
  if (!prospect) return { ok: false, error: 'Prospect not found.' }
  if (prospect.disposition !== 'open') {
    return { ok: false, error: 'This prospect is closed (replied, bounced, or unsubscribed).' }
  }

  // No duplicate active send for the same draft.
  const { data: existing } = await supabase
    .from('outreach_sends')
    .select('id')
    .eq('draft_id', draftId)
    .in('status', ['queued', 'sending', 'sent'])
    .limit(1)
  if (existing && existing.length > 0) return { ok: false, error: 'This draft is already queued or sent.' }

  const composed = composeEmail(draft.subject, draft.body, settings)
  const scheduled_at = await nextSlot(supabase, companyId, settings)

  const { error } = await supabase.from('outreach_sends').insert({
    company_id: companyId,
    prospect_id: draft.prospect_id,
    draft_id: draftId,
    provider: settings.provider,
    recipient_email: prospect.email,
    subject: composed.subject,
    body: composed.body,
    status: 'queued',
    scheduled_at,
  })
  if (error) return { ok: false, error: 'Could not queue the send.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

export async function cancelSend(companyId: string, sendId: string): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_sends')
    .update({ status: 'canceled' })
    .eq('id', sendId)
    .eq('company_id', companyId)
    .eq('status', 'queued')
  if (error) return { ok: false, error: 'Could not cancel the send.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

/** Manually process the due send queue now (same path the cron worker runs). */
export async function processSendQueue(companyId: string): Promise<ActionResult<{ sent: number; failed: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const result = await runQueue(supabase, companyId)
  revalidatePath('/outreach')
  return { ok: true, data: result }
}
