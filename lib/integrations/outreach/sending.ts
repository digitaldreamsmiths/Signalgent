'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import type { ActionResult, ScheduledSendView, SendSettings } from './types'
import { getAccount } from '@/lib/integrations/accounts'
import { composeEmail } from './send/compose'
import { computeBatchSlots, loadSettings, nextSlot, runQueue } from './send/worker'
import { scanReplies } from './send/scan'

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
  // Derive warmup anchor + pause reason from an active toggle.
  const derived: Partial<SendSettings> = {}
  if (patch.active === true) {
    derived.pause_reason = null // re-enabling clears any auto-pause
    const { data: cur } = await supabase.from('outreach_settings').select('warmup_started_at').eq('company_id', companyId).maybeSingle()
    if (!cur?.warmup_started_at) {
      // Anchor the warmup ramp at the first-ever send, or now if none yet.
      const { data: first } = await supabase
        .from('outreach_sends')
        .select('sent_at')
        .eq('company_id', companyId)
        .eq('status', 'sent')
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      derived.warmup_started_at = first?.sent_at ?? new Date().toISOString()
    }
  } else if (patch.active === false) {
    derived.pause_reason = 'manual'
  }
  const { error } = await supabase
    .from('outreach_settings')
    .upsert({ company_id: companyId, ...patch, ...derived, updated_at: new Date().toISOString() }, { onConflict: 'company_id' })
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
  if (settings.provider === 'gmail') {
    const gmail = await getAccount(companyId, 'gmail')
    if (gmail?.status !== 'connected') {
      return { ok: false, error: 'Connect Gmail in Settings → Connections first.' }
    }
  }

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
export async function processSendQueue(companyId: string): Promise<ActionResult<{ sent: number; failed: number; recovered: number }>> {
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

/** Manually run the reply/bounce scanner (the "Scan replies" button). Bypasses
 * the cron throttle via { force: true }. */
export async function scanRepliesNow(companyId: string): Promise<ActionResult<{ replied: number; bounced: number; unsubscribed: number; skipped?: string }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const result = await scanReplies(supabase, companyId, { force: true })
  revalidatePath('/outreach')
  return { ok: true, data: result }
}

// ── Batch scheduling ────────────────────────────────────────────────────────

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** Shared gate: sending on, sender set, and (for gmail) a connected mailbox. */
async function ensureSendable(supabase: SupabaseServerClient, companyId: string, settings: SendSettings): Promise<string | null> {
  if (!settings.active) return 'Turn on sending in Sending settings first.'
  if (!settings.sender_email?.trim()) return 'Set a sender email in Sending settings first.'
  if (settings.provider === 'gmail') {
    const gmail = await getAccount(companyId, 'gmail')
    if (gmail?.status !== 'connected') return 'Connect Gmail in Settings → Connections first.'
  }
  return null
}

/** Schedule a batch of approved drafts to start sending at a chosen time. */
export async function scheduleDraftSends(
  companyId: string,
  draftIds: string[],
  startAtIso: string,
): Promise<ActionResult<{ scheduled: number; skipped: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const settings = await loadSettings(supabase, companyId)
  const gate = await ensureSendable(supabase, companyId, settings)
  if (gate) return { ok: false, error: gate }
  if (draftIds.length === 0) return { ok: true, data: { scheduled: 0, skipped: 0 } }

  const { data: drafts } = await supabase
    .from('outreach_drafts')
    .select('id, subject, body, prospect_id')
    .eq('company_id', companyId)
    .in('id', draftIds)
  const { data: existing } = await supabase
    .from('outreach_sends')
    .select('draft_id')
    .eq('company_id', companyId)
    .in('status', ['queued', 'sending', 'sent'])
    .in('draft_id', draftIds)
  const alreadyQueued = new Set((existing ?? []).map((e) => e.draft_id))

  const prospectIds = [...new Set((drafts ?? []).map((d) => d.prospect_id))]
  const { data: prospects } = await supabase
    .from('outreach_prospects')
    .select('id, email, disposition')
    .in('id', prospectIds.length ? prospectIds : ['00000000-0000-0000-0000-000000000000'])
  const pById = new Map((prospects ?? []).map((p) => [p.id, p]))

  const eligible = (drafts ?? []).filter((d) => {
    if (alreadyQueued.has(d.id)) return false
    const p = pById.get(d.prospect_id)
    return !!p && p.disposition === 'open' && !!p.email
  })
  const skipped = draftIds.length - eligible.length
  if (eligible.length === 0) return { ok: true, data: { scheduled: 0, skipped } }

  const slots = await computeBatchSlots(supabase, companyId, settings, startAtIso, eligible.length)
  const rows = eligible.map((d, i) => {
    const p = pById.get(d.prospect_id)!
    const composed = composeEmail(d.subject, d.body, settings)
    return {
      company_id: companyId,
      prospect_id: d.prospect_id,
      draft_id: d.id,
      provider: settings.provider,
      recipient_email: p.email,
      subject: composed.subject,
      body: composed.body,
      status: 'queued' as const,
      scheduled_at: slots[i],
    }
  })
  const { error } = await supabase.from('outreach_sends').insert(rows)
  if (error) return { ok: false, error: 'Could not schedule the sends.' }
  revalidatePath('/outreach')
  return { ok: true, data: { scheduled: rows.length, skipped } }
}

/** Move a set of queued sends to a new start time (same batch layout). */
export async function rescheduleSends(
  companyId: string,
  sendIds: string[],
  startAtIso: string,
): Promise<ActionResult<{ rescheduled: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (sendIds.length === 0) return { ok: true, data: { rescheduled: 0 } }
  const supabase = await createClient()
  const settings = await loadSettings(supabase, companyId)

  const { data: sends } = await supabase
    .from('outreach_sends')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'queued')
    .in('id', sendIds)
  const ids = (sends ?? []).map((s) => s.id)
  if (ids.length === 0) return { ok: true, data: { rescheduled: 0 } }

  const slots = await computeBatchSlots(supabase, companyId, settings, startAtIso, ids.length, ids)
  for (let i = 0; i < ids.length; i++) {
    await supabase.from('outreach_sends').update({ scheduled_at: slots[i] }).eq('id', ids[i]).eq('company_id', companyId)
  }
  revalidatePath('/outreach')
  return { ok: true, data: { rescheduled: ids.length } }
}

/** Cancel a set of queued sends. */
export async function cancelSends(companyId: string, sendIds: string[]): Promise<ActionResult<{ canceled: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (sendIds.length === 0) return { ok: true, data: { canceled: 0 } }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outreach_sends')
    .update({ status: 'canceled' })
    .eq('company_id', companyId)
    .eq('status', 'queued')
    .in('id', sendIds)
    .select('id')
  if (error) return { ok: false, error: 'Could not cancel the sends.' }
  revalidatePath('/outreach')
  return { ok: true, data: { canceled: data?.length ?? 0 } }
}

/** All queued sends for the scheduling calendar/list, soonest first. */
export async function getScheduledSends(companyId: string): Promise<ScheduledSendView[]> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return []
    throw err
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from('outreach_sends')
    .select('id, draft_id, prospect_id, recipient_email, scheduled_at')
    .eq('company_id', companyId)
    .eq('status', 'queued')
    .order('scheduled_at', { ascending: true })
  const prospectIds = [...new Set((data ?? []).map((s) => s.prospect_id))]
  const { data: prospects } = await supabase
    .from('outreach_prospects')
    .select('id, recipient_name')
    .in('id', prospectIds.length ? prospectIds : ['00000000-0000-0000-0000-000000000000'])
  const nameById = new Map((prospects ?? []).map((p) => [p.id, p.recipient_name]))
  return (data ?? []).map((s) => ({
    id: s.id,
    draft_id: s.draft_id,
    recipient_email: s.recipient_email,
    recipient_name: nameById.get(s.prospect_id) ?? null,
    scheduled_at: s.scheduled_at,
  }))
}
