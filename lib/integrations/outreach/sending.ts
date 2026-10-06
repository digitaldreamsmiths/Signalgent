'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import type { ActionResult, ScheduledSendView, SendSettings } from './types'
import { getAccountByIdentifier } from '@/lib/integrations/accounts'
import { composeEmail } from './send/compose'
import { computeBatchSlots, loadSettings, nextSlot, parseWallTime, runQueue, zonedStartIso } from './send/worker'
import { insertSendRows } from './send/queue'
import { loadOfferProfile } from './offer-profile'
import { scanReplies } from './send/scan'
import { loadCampaigns, timezoneForProspect } from './campaigns'
import { recipientIsSuppressed } from './send/suppression'
import { fetchAllPagesResult } from './fetch-all'
import { applyGreeting, fetchStoredContactNames, resolveContactName } from './contact-name'
import { pickTemplateDraft } from './enrich-run'
import { renderTemplate } from './template'
import { usesUsaspending } from './usaspending-preference'

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
  const { data: company } = await supabase.from('companies').select('is_sample').eq('id', companyId).single()
  if (!company) return { ok: false, error: 'Company profile unavailable.' }
  const effectiveProvider = patch.provider ?? (await loadSettings(supabase, companyId)).provider
  if (company.is_sample && effectiveProvider !== 'dry_run' && patch.active !== false) return { ok: false, error: 'Sample companies can only use Dry run sending.' }
  if (patch.send_days !== undefined &&
      (!Array.isArray(patch.send_days) || patch.send_days.length < 1 || patch.send_days.length > 7 ||
       new Set(patch.send_days).size !== patch.send_days.length ||
       !patch.send_days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6))) {
    return { ok: false, error: 'Select at least one valid sending day.' }
  }
  if (effectiveProvider === 'outlook') {
    patch.followup_enabled = false
    patch.bounce_pause_enabled = false
  }
  // Normalize the send window to 24h "HH:MM" — scheduling reads it back with
  // parseWallTime, but a canonical stored form keeps the UI and any other
  // reader honest. Reject what can't be parsed instead of storing it.
  for (const key of ['send_window_start', 'send_window_end'] as const) {
    const raw = patch[key]
    if (typeof raw === 'string') {
      const t = parseWallTime(raw)
      if (!t) return { ok: false, error: `“${raw}” isn’t a valid time — use HH:MM (24h) or e.g. “8:00 pm”.` }
      patch[key] = `${String(t[0]).padStart(2, '0')}:${String(t[1]).padStart(2, '0')}`
    }
  }
  if (patch.send_window_start && patch.send_window_end && patch.send_window_end <= patch.send_window_start) {
    return { ok: false, error: 'The send window must end after it starts.' }
  }
  // Derive warmup anchor + pause reason from an active toggle.
  const derived: Partial<SendSettings> = {}

  // Switching to a different sending mailbox restarts the warmup ramp. The
  // anchor is per-company, so without this a brand-new mailbox inherits the old
  // one's fully-ramped cap and sends at full volume on day one — the fastest
  // way to burn a fresh sender's reputation.
  if (typeof patch.sender_email === 'string') {
    const { data: prev } = await supabase.from('outreach_settings').select('sender_email').eq('company_id', companyId).maybeSingle()
    const before = prev?.sender_email?.trim().toLowerCase() ?? ''
    const after = patch.sender_email.trim().toLowerCase()
    if (before && after && before !== after) derived.warmup_started_at = new Date().toISOString()
  }

  if (patch.active === true) {
    derived.pause_reason = null // re-enabling clears any auto-pause
    const { data: cur } = await supabase.from('outreach_settings').select('warmup_started_at').eq('company_id', companyId).maybeSingle()
    if (!derived.warmup_started_at && !cur?.warmup_started_at) {
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
  if (error) {
    // The follow-up columns arrive via an out-of-band migration. Until it is
    // applied, saving the full form would fail outright — and this save is also
    // the sending kill switch, which must never be blocked. Retry without them.
    if (/followup_/.test(error.message)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { followup_enabled, followup_wait_days, followup_max_touches, ...rest } = patch
      const retry = await supabase
        .from('outreach_settings')
        .upsert({ company_id: companyId, ...rest, ...derived, updated_at: new Date().toISOString() }, { onConflict: 'company_id' })
      if (!retry.error) {
        revalidatePath('/outreach')
        return { ok: true, data: undefined }
      }
    }
    return { ok: false, error: 'Could not save sending settings.' }
  }
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
  const { data: company } = await supabase.from('companies').select('is_sample').eq('id', companyId).single()
  if (!company || (company.is_sample && settings.provider !== 'dry_run')) return { ok: false, error: 'Sample companies can only use Dry run sending.' }
  if (!settings.active) return { ok: false, error: 'Turn on sending in Sending settings first.' }
  if (!settings.sender_email?.trim()) return { ok: false, error: 'Set a sender email in Sending settings first.' }
  if (settings.provider === 'gmail' || settings.provider === 'outlook') {
    const mailbox = await getAccountByIdentifier(companyId, settings.provider, settings.sender_email)
    if (mailbox?.status !== 'connected') {
      return { ok: false, error: 'Connect the sender mailbox in Connections first.' }
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
  try {
    if (await recipientIsSuppressed(supabase, companyId, prospect.email)) {
      return { ok: false, error: 'This email address has bounced or opted out.' }
    }
  } catch {
    return { ok: false, error: 'Could not check the suppression list.' }
  }

  // No duplicate active send for the same draft.
  const { data: existing } = await supabase
    .from('outreach_sends')
    .select('id')
    .eq('draft_id', draftId)
    .in('status', ['queued', 'sending', 'sent'])
    .limit(1)
  if (existing && existing.length > 0) return { ok: false, error: 'This draft is already queued or sent.' }

  // Tokens are minted here, not by a column default: the unsubscribe link has
  // to be inside the body, and the body is composed before the row exists.
  const open_token = randomUUID()
  const unsub_token = randomUUID()
  const profile = await loadOfferProfile(supabase, companyId)
  const composed = composeEmail(draft.subject, draft.body, settings, unsub_token, profile)
  const scheduled_at = await nextSlot(supabase, companyId, await timezoneForProspect(supabase, companyId, draft.prospect_id, settings), settings.timezone)

  const base = {
    company_id: companyId,
    prospect_id: draft.prospect_id,
    draft_id: draftId,
    provider: settings.provider,
    recipient_email: prospect.email,
    subject: composed.subject,
    body: composed.body,
    status: 'queued' as const,
    scheduled_at,
  }
  const error = await insertSendRows(supabase, [{ ...base, open_token, unsub_token }], [base])
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
  try {
    await scanReplies(supabase, companyId, { force: true })
  } catch {
    return { ok: false, error: 'Could not check the inbox for new replies and opt-outs. No emails were sent.' }
  }
  const result = await runQueue(supabase, companyId)
  revalidatePath('/outreach')
  return { ok: true, data: result }
}

/** Manually run the reply/bounce scanner (the "Scan replies" button). Bypasses
 * the cron throttle via { force: true }. */
export async function scanRepliesNow(companyId: string): Promise<ActionResult<{ replied: number; bounced: number; unsubscribed: number; softBounced?: number; skipped?: string }>> {
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
  if (settings.provider === 'gmail' || settings.provider === 'outlook') {
    const mailbox = await getAccountByIdentifier(companyId, settings.provider, settings.sender_email)
    if (mailbox?.status !== 'connected') return 'Connect the sender mailbox in Connections first.'
  }
  return null
}

/** Schedule a batch of approved drafts to start sending at a chosen time. */
export async function scheduleDraftSends(
  companyId: string,
  draftIds: string[],
  startAtIso: string,
  startWall?: { date: string; time: string },
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
    .select('id, subject, body, prospect_id, facts_for_draft')
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
    .select('id, email, disposition, campaign_id')
    .in('id', prospectIds.length ? prospectIds : ['00000000-0000-0000-0000-000000000000'])
  const pById = new Map((prospects ?? []).map((p) => [p.id, p]))
  const suppression = await fetchAllPagesResult((from, to) => supabase.from('outreach_prospects')
    .select('id, email').eq('company_id', companyId)
    .in('disposition', ['bounced', 'unsubscribed'])
    .order('id').range(from, to))
  if (suppression.error) return { ok: false, error: 'Could not check the suppression list.' }
  const suppressedEmails = new Set(suppression.rows.map((p) => p.email.trim().toLowerCase()))

  const unsorted = (drafts ?? []).filter((d) => {
    if (alreadyQueued.has(d.id)) return false
    const p = pById.get(d.prospect_id)
    return !!p && p.disposition === 'open' && !!p.email && !suppressedEmails.has(p.email.trim().toLowerCase())
  })
  // Personalized drafts (non-empty facts_for_draft) outrank templates: slots are
  // handed out by array index, so ordering here is what puts custom emails on
  // the earliest send times.
  const isPersonalized = (d: { facts_for_draft: unknown }) =>
    Array.isArray(d.facts_for_draft) && d.facts_for_draft.length > 0
  const eligible = [...unsorted.filter(isPersonalized), ...unsorted.filter((d) => !isPersonalized(d))]
  const skipped = draftIds.length - eligible.length
  if (eligible.length === 0) return { ok: true, data: { scheduled: 0, skipped } }

  const campaigns = new Map((await loadCampaigns(supabase, companyId)).map((campaign) => [campaign.id, campaign]))
  const slots: string[] = Array(eligible.length)
  const reserved: string[] = []
  const groups = new Map<string, number[]>()
  for (let i = 0; i < eligible.length; i++) {
    const campaignId = pById.get(eligible[i].prospect_id)?.campaign_id
    const timezone = (campaignId && campaigns.get(campaignId)?.timezone) || settings.timezone
    groups.set(timezone, [...(groups.get(timezone) ?? []), i])
  }
  for (const [timezone, indices] of groups) {
    const groupStart = startWall ? zonedStartIso(startWall.date, startWall.time, timezone) : startAtIso
    if (!groupStart) return { ok: false, error: 'Choose a valid start date and time.' }
    const groupSlots = await computeBatchSlots(supabase, companyId, { ...settings, timezone }, groupStart, indices.length, [], reserved, settings.timezone)
    indices.forEach((index, position) => { slots[index] = groupSlots[position] })
    reserved.push(...groupSlots)
  }
  const profile = await loadOfferProfile(supabase, companyId)
  const rows = eligible.map((d, i) => {
    const p = pById.get(d.prospect_id)!
    // Per-send tokens (see queueDraftSend): the unsubscribe link lives in the
    // body, so it must exist before the row is inserted.
    const open_token = randomUUID()
    const unsub_token = randomUUID()
    const composed = composeEmail(d.subject, d.body, settings, unsub_token, profile)
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
      open_token,
      unsub_token,
    }
  })
  const error = await insertSendRows(
    supabase,
    rows,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rows.map(({ open_token, unsub_token, ...rest }) => rest),
  )
  if (error) return { ok: false, error: 'Could not schedule the sends.' }
  revalidatePath('/outreach')
  return { ok: true, data: { scheduled: rows.length, skipped } }
}

/** Move a set of queued sends to a new start time (same batch layout). */
export async function rescheduleSends(
  companyId: string,
  sendIds: string[],
  startAtIso: string,
  startWall?: { date: string; time: string },
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
    .select('id, prospect_id')
    .eq('company_id', companyId)
    .eq('status', 'queued')
    .in('id', sendIds)
  const ids = (sends ?? []).map((s) => s.id)
  if (ids.length === 0) return { ok: true, data: { rescheduled: 0 } }
  const campaigns = new Map((await loadCampaigns(supabase, companyId)).map((campaign) => [campaign.id, campaign]))
  const { data: prospects } = await supabase.from('outreach_prospects').select('id, campaign_id')
    .eq('company_id', companyId).in('id', [...new Set((sends ?? []).map((send) => send.prospect_id))])
  const campaignByProspect = new Map((prospects ?? []).map((prospect) => [prospect.id, prospect.campaign_id]))
  const slots: string[] = Array(ids.length)
  const reserved: string[] = []
  const groups = new Map<string, number[]>()
  for (let i = 0; i < ids.length; i++) {
    const campaignId = campaignByProspect.get(sends![i].prospect_id)
    const timezone = (campaignId && campaigns.get(campaignId)?.timezone) || settings.timezone
    groups.set(timezone, [...(groups.get(timezone) ?? []), i])
  }
  for (const [timezone, indices] of groups) {
    const groupStart = startWall ? zonedStartIso(startWall.date, startWall.time, timezone) : startAtIso
    if (!groupStart) return { ok: false, error: 'Choose a valid start date and time.' }
    const groupSlots = await computeBatchSlots(supabase, companyId, { ...settings, timezone }, groupStart, indices.length, ids, reserved, settings.timezone)
    indices.forEach((index, position) => { slots[index] = groupSlots[position] })
    reserved.push(...groupSlots)
  }
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

/**
 * Rebuild queued template emails from the templates that are active now.
 *
 * A send row freezes its subject and body when it is queued, so editing or
 * swapping templates never reaches emails already on the calendar. This finds
 * every queued step-one send whose draft came from a template that has since
 * been deactivated or edited, re-renders the draft from the current active
 * rotation, cancels the old send, and queues the new copy in the same slot.
 * Personalized drafts and sends from unchanged templates are left alone.
 */
export async function redraftTemplateSends(
  companyId: string,
): Promise<ActionResult<{ redrafted: number; skipped: number; rewritten: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const settings = await loadSettings(supabase, companyId)

  const { data: templates, error: templatesError } = await supabase
    .from('outreach_templates')
    .select('id, subject, body, weight, active, updated_at')
    .eq('company_id', companyId)
  if (templatesError) return { ok: false, error: 'Could not load the templates.' }
  const templateById = new Map((templates ?? []).map((t) => [t.id, t]))
  const activeTemplates = (templates ?? []).filter((t) => t.active)
  if (activeTemplates.length === 0) return { ok: false, error: 'Activate at least one template first.' }
  const isStale = (templateId: string | null, draftUpdatedAt: string) => {
    if (!templateId) return false
    const t = templateById.get(templateId)
    return !t || !t.active || t.updated_at > draftUpdatedAt
  }
  // Weighted random across the active set — the same rotation pickTemplateDraft
  // uses, without a templates read per draft.
  const pickActive = () => {
    const total = activeTemplates.reduce((s, t) => s + Math.max(1, t.weight), 0)
    let r = Math.random() * total
    for (const t of activeTemplates) { r -= Math.max(1, t.weight); if (r < 0) return t }
    return activeTemplates[activeTemplates.length - 1]
  }

  // Part one: approved first-touch drafts that are NOT on the calendar yet.
  // These are what "Schedule unqueued" would send, so stale copy here is the
  // same risk as stale copy in the queue. No send rows are involved: the draft
  // is rewritten in place and stays approved.
  let rewritten = 0
  const waiting = await fetchAllPagesResult((from, to) => supabase
    .from('outreach_drafts')
    .select('id, prospect_id, template_id, updated_at')
    .eq('company_id', companyId)
    .eq('status', 'approved')
    .eq('step', 1)
    .not('template_id', 'is', null)
    .order('id').range(from, to))
  if (waiting.error) return { ok: false, error: 'Could not load the waiting drafts.' }
  const staleWaiting = waiting.rows.filter((d) => isStale(d.template_id, d.updated_at))
  if (staleWaiting.length > 0) {
    // Leave anything that has a live or completed send alone: queued ones are
    // handled below, sent ones are history.
    const live = new Set<string>()
    const ids = staleWaiting.map((d) => d.id)
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from('outreach_sends')
        .select('draft_id')
        .eq('company_id', companyId)
        .in('status', ['queued', 'sending', 'sent'])
        .in('draft_id', ids.slice(i, i + 200))
      if (error) return { ok: false, error: 'Could not check the send queue.' }
      for (const s of data ?? []) if (s.draft_id) live.add(s.draft_id)
    }
    const targets = staleWaiting.filter((d) => !live.has(d.id))
    const targetProspectIds = [...new Set(targets.map((d) => d.prospect_id))]
    const prospectRows: { id: string; email: string; recipient_name: string | null }[] = []
    for (let i = 0; i < targetProspectIds.length; i += 200) {
      const { data, error } = await supabase
        .from('outreach_prospects')
        .select('id, email, recipient_name')
        .eq('company_id', companyId)
        .in('id', targetProspectIds.slice(i, i + 200))
      if (error) return { ok: false, error: 'Could not load the prospects.' }
      prospectRows.push(...(data ?? []))
    }
    const prospectOf = new Map(prospectRows.map((p) => [p.id, p]))
    const names = await fetchStoredContactNames(supabase, companyId, targetProspectIds)
    // Twenty at a time: 1,000+ drafts one by one would outlast the request.
    for (let i = 0; i < targets.length; i += 20) {
      const results = await Promise.all(targets.slice(i, i + 20).map(async (d) => {
        const prospect = prospectOf.get(d.prospect_id)
        if (!prospect) return false
        const tmpl = pickActive()
        const rendered = renderTemplate(tmpl, prospect.recipient_name ?? null)
        const { error } = await supabase
          .from('outreach_drafts')
          .update({
            subject: rendered.subject,
            body: applyGreeting(rendered.body, resolveContactName(names.get(prospect.id), prospect.email)),
            template_id: tmpl.id,
            status: 'approved',
            clean: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', d.id).eq('company_id', companyId)
        return !error
      }))
      rewritten += results.filter(Boolean).length
    }
  }

  const queued = await fetchAllPagesResult((from, to) => supabase
    .from('outreach_sends')
    .select('id, draft_id, prospect_id, scheduled_at')
    .eq('company_id', companyId)
    .eq('status', 'queued')
    .not('draft_id', 'is', null)
    .order('id').range(from, to))
  if (queued.error) return { ok: false, error: 'Could not load the queued sends.' }
  if (queued.rows.length === 0) return { ok: true, data: { redrafted: 0, skipped: 0, rewritten } }

  const draftIds = [...new Set(queued.rows.map((s) => s.draft_id as string))]
  const drafts: { id: string; prospect_id: string; template_id: string | null; step: number; updated_at: string }[] = []
  for (let i = 0; i < draftIds.length; i += 200) {
    const { data, error } = await supabase
      .from('outreach_drafts')
      .select('id, prospect_id, template_id, step, updated_at')
      .eq('company_id', companyId)
      .in('id', draftIds.slice(i, i + 200))
    if (error) return { ok: false, error: 'Could not load the drafts.' }
    drafts.push(...(data ?? []))
  }
  const draftById = new Map(drafts.map((d) => [d.id, d]))

  const stale = queued.rows.filter((s) => {
    const d = draftById.get(s.draft_id as string)
    return !!d && d.step === 1 && isStale(d.template_id, d.updated_at)
  })
  if (stale.length === 0) { revalidatePath('/outreach'); return { ok: true, data: { redrafted: 0, skipped: queued.rows.length, rewritten } } }

  const prospectIds = [...new Set(stale.map((s) => s.prospect_id))]
  const prospects: { id: string; email: string; recipient_name: string | null; disposition: string }[] = []
  for (let i = 0; i < prospectIds.length; i += 200) {
    const { data, error } = await supabase
      .from('outreach_prospects')
      .select('id, email, recipient_name, disposition')
      .eq('company_id', companyId)
      .in('id', prospectIds.slice(i, i + 200))
    if (error) return { ok: false, error: 'Could not load the prospects.' }
    prospects.push(...(data ?? []))
  }
  const prospectById = new Map(prospects.map((p) => [p.id, p]))
  const storedNames = await fetchStoredContactNames(supabase, companyId, prospectIds)
  const profile = await loadOfferProfile(supabase, companyId)
  const federal = await usesUsaspending(supabase, companyId)

  let redrafted = 0
  let skipped = queued.rows.length - stale.length
  for (const send of stale) {
    const draft = draftById.get(send.draft_id as string)!
    const prospect = prospectById.get(send.prospect_id)
    if (!prospect || prospect.disposition !== 'open' || !prospect.email) { skipped++; continue }

    const picked = await pickTemplateDraft(supabase, companyId, prospect.recipient_name ?? null, prospect.id, profile, federal)
    const subject = picked.draft.subject
    const body = applyGreeting(picked.draft.body, resolveContactName(storedNames.get(prospect.id), prospect.email))
    const now = new Date().toISOString()

    // Draft first, then retire the old send, then queue the new copy. If the
    // insert fails the draft stays approved in Ready to email, where it can be
    // scheduled by hand; nothing is ever double-queued.
    const { error: draftError } = await supabase
      .from('outreach_drafts')
      .update({ subject, body, template_id: picked.template_id, status: 'approved', clean: true, updated_at: now })
      .eq('id', draft.id).eq('company_id', companyId)
    if (draftError) { skipped++; continue }
    const { data: canceled, error: cancelError } = await supabase
      .from('outreach_sends')
      .update({ status: 'canceled', error: 'Re-drafted from current templates', updated_at: now })
      .eq('id', send.id).eq('company_id', companyId).eq('status', 'queued')
      .select('id')
    if (cancelError || !canceled?.length) { skipped++; continue }

    const open_token = randomUUID()
    const unsub_token = randomUUID()
    const composed = composeEmail(subject, body, settings, unsub_token, profile)
    const row = {
      company_id: companyId,
      prospect_id: prospect.id,
      draft_id: draft.id,
      provider: settings.provider,
      recipient_email: prospect.email,
      subject: composed.subject,
      body: composed.body,
      status: 'queued' as const,
      scheduled_at: send.scheduled_at,
      open_token,
      unsub_token,
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { open_token: _o, unsub_token: _u, ...withoutTracking } = row
    const insertError = await insertSendRows(supabase, [row], [withoutTracking])
    if (insertError) { skipped++; continue }
    redrafted++
  }
  revalidatePath('/outreach')
  return { ok: true, data: { redrafted, skipped, rewritten } }
}
