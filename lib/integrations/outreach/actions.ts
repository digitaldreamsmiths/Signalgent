'use server'

/**
 * Server actions for the outreach review queue (Marketing mode).
 *
 * Every action enforces requireCompanyAccess(companyId) before touching data.
 * Mirrors the comms/assist discriminated-result convention so the widget can
 * render success / friendly-error inline.
 *
 * Send is OUT OF SCOPE — there is no send action here on purpose. Approved
 * drafts are exported to the dedicated cold-email platform out of band.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import type { Database } from '@/lib/types/database.types'
import { extractDomain } from '../usaspending/resolve'
import { runPipelineFromName } from './pipeline'
import { buildTemplateFollowup } from './template'
import { persistOutcome, recordUsage, runEnrichmentBatch, runEnrichmentBatchForIds, enrichToBuffer, RUN_BATCH } from './enrich-run'
import { loadSettings, getEffectiveDailyCap } from './send/worker'
import { recentBounceStats } from './send/scan'
import { getAccount } from '../accounts'
import { draftEmail } from './draft'
import { undeliverableDomains } from './deliverability'
import type { LLMUsage } from '../../llm/client'
import type {
  ActionResult,
  Disposition,
  OutreachDraftView,
  OutreachProspectView,
  OutreachSendView,
  OutreachSnapshot,
  SynthesisResult,
} from './types'

const AUTH_ERROR = 'You don’t have access to this workspace.'


// ── Ingest ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g

export async function ingestProspects(
  companyId: string,
  raw: string,
): Promise<ActionResult<{ added: number; duplicates: number; invalid: number; undeliverable: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }

  const matches = raw.match(EMAIL_RE) ?? []
  const seen = new Set<string>()
  const rows: { company_id: string; email: string; domain: string | null; status: 'new' }[] = []
  let invalid = 0
  for (const m of matches) {
    const email = m.trim().toLowerCase()
    if (seen.has(email)) continue
    seen.add(email)
    const domain = extractDomain(email)
    if (!domain) {
      invalid += 1
      continue
    }
    rows.push({ company_id: companyId, email, domain, status: 'new' })
  }

  if (rows.length === 0) {
    return { ok: true, data: { added: 0, duplicates: 0, invalid, undeliverable: 0 } }
  }

  // Deliverability: drop domains that definitively can't receive mail (no MX and
  // no A record), so dead addresses never reach enrichment or the sending tool.
  const bad = await undeliverableDomains(rows.map((r) => r.domain).filter((d): d is string => !!d))
  const sendable = rows.filter((r) => !r.domain || !bad.has(r.domain))
  const undeliverable = rows.length - sendable.length

  if (sendable.length === 0) {
    return { ok: true, data: { added: 0, duplicates: 0, invalid, undeliverable } }
  }

  const supabase = await createClient()
  // Insert, ignoring rows that already exist (unique company_id+email).
  const { data, error } = await supabase
    .from('outreach_prospects')
    .upsert(sendable, { onConflict: 'company_id,email', ignoreDuplicates: true })
    .select('id')

  if (error) return { ok: false, error: 'Could not save prospects. Try again.' }

  const added = data?.length ?? 0
  revalidatePath('/outreach')
  return { ok: true, data: { added, duplicates: sendable.length - added, invalid, undeliverable } }
}

// ── Run the pipeline over new prospects ───────────────────────────────────────

export async function runNewProspects(
  companyId: string,
  limit: number = RUN_BATCH,
): Promise<ActionResult<{ processed: number; drafted: number; skipped: number; remaining: number; cost_usd: number }>> {
  let access: Awaited<ReturnType<typeof requireCompanyAccess>>
  try {
    access = await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }

  const supabase = await createClient()
  const data = await runEnrichmentBatch(supabase, companyId, limit, access.userId)
  revalidatePath('/outreach')
  return { ok: true, data }
}

/** Enrich a caller-selected set of `new` prospects right now, bypassing the wave
 * buffer cap. Powers the Contacts tab's "Process (N)" bulk action: the client
 * loops one RUN_BATCH at a time (shrinking `prospectIds` by `processedIds`), so a
 * large selection drains progressively and the "To review" queue fills as each
 * batch lands, instead of being throttled by the drip pacing. */
export async function processProspects(
  companyId: string,
  prospectIds: string[],
  limit: number = RUN_BATCH,
): Promise<ActionResult<{ processed: number; drafted: number; skipped: number; remaining: number; cost_usd: number; processedIds: string[] }>> {
  let access: Awaited<ReturnType<typeof requireCompanyAccess>>
  try {
    access = await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (prospectIds.length === 0) {
    return { ok: true, data: { processed: 0, drafted: 0, skipped: 0, remaining: 0, cost_usd: 0, processedIds: [] } }
  }
  const supabase = await createClient()
  const data = await runEnrichmentBatchForIds(supabase, companyId, prospectIds, limit, access.userId)
  revalidatePath('/outreach')
  return { ok: true, data }
}

/** Enrich one wave: top up the enriched-and-ready buffer to ~3 days of send
 * capacity. The "Enrich wave" button and the cron both use this — enrichment is
 * intentionally incremental so federal-award facts stay fresh. */
export async function enrichWaveNow(
  companyId: string,
): Promise<ActionResult<{ enriched: number; drafted: number; skipped: number; remaining: number; cost_usd: number; note?: string }>> {
  let access: Awaited<ReturnType<typeof requireCompanyAccess>>
  try {
    access = await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const data = await enrichToBuffer(supabase, companyId, access.userId)
  revalidatePath('/outreach')
  return { ok: true, data }
}

// ── Snapshot read ─────────────────────────────────────────────────────────────

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export async function getOutreachSnapshot(companyId: string): Promise<OutreachSnapshot | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }

  const supabase = await createClient()
  const [{ data: prospects }, { data: drafts }, { data: usageRows }, { data: sends }] = await Promise.all([
    supabase.from('outreach_prospects').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('outreach_drafts').select('*').eq('company_id', companyId),
    supabase.from('api_usage').select('cost_usd').eq('company_id', companyId).like('feature', 'outreach:%'),
    supabase.from('outreach_sends').select('id, draft_id, status, scheduled_at, sent_at, error').eq('company_id', companyId).order('created_at', { ascending: false }),
  ])

  const cost_usd_total = (usageRows ?? []).reduce((s, r) => s + (r.cost_usd ?? 0), 0)

  // Latest send per draft (rows arrive newest-first, so first seen wins).
  const sendByDraft = new Map<string, OutreachSendView>()
  let queued = 0
  for (const s of sends ?? []) {
    if (s.status === 'queued') queued += 1
    if (!sendByDraft.has(s.draft_id)) {
      sendByDraft.set(s.draft_id, { id: s.id, status: s.status, scheduled_at: s.scheduled_at, sent_at: s.sent_at, error: s.error })
    }
  }

  const draftsByProspect = new Map<string, OutreachDraftView[]>()
  for (const d of drafts ?? []) {
    const facts = asStringArray(d.facts_for_draft)
    const view: OutreachDraftView = {
      id: d.id,
      subject: d.subject,
      body: d.body,
      angle: d.angle,
      synthesis_confidence: d.synthesis_confidence,
      clean: d.clean,
      drifted_facts: asStringArray(d.drifted_facts),
      facts_for_draft: facts,
      facts_used: asStringArray(d.facts_used),
      status: d.status,
      step: d.step,
      is_template: facts.length === 0,
      send: sendByDraft.get(d.id) ?? null,
    }
    const arr = draftsByProspect.get(d.prospect_id)
    if (arr) arr.push(view)
    else draftsByProspect.set(d.prospect_id, [view])
  }
  // Order each prospect's touches by step (1 = initial email).
  for (const arr of draftsByProspect.values()) arr.sort((a, b) => a.step - b.step)

  const views: OutreachProspectView[] = (prospects ?? []).map((p) => {
    const fp = p.footprint as { award_count?: number; sampled_total?: number } | null
    return {
      id: p.id,
      email: p.email,
      domain: p.domain,
      created_at: p.created_at,
      status: p.status,
      skip_stage: p.skip_stage,
      skip_reason: p.skip_reason,
      recipient_name: p.recipient_name,
      resolution_confidence: p.resolution_confidence,
      business_types: p.business_types ?? [],
      location: p.location,
      footprint: fp && typeof fp.award_count === 'number'
        ? { award_count: fp.award_count, sampled_total: fp.sampled_total ?? 0 }
        : null,
      drafts: draftsByProspect.get(p.id) ?? [],
      draft: (draftsByProspect.get(p.id) ?? []).at(-1) ?? null,
      disposition: p.disposition,
      disposition_at: p.disposition_at,
      reply_from: p.reply_from,
      reply_subject: p.reply_subject,
      reply_snippet: p.reply_snippet,
      // A plausible-but-uncertain resolver result (low confidence) — surfaced
      // for manual disambiguation rather than left as a silent skip.
      needs_review:
        p.status === 'skipped' &&
        p.skip_stage === 'enrich' &&
        (p.skip_reason ?? '').startsWith('low_confidence'),
    }
  })

  const sent = views.filter((v) => v.drafts.some((d) => d.status === 'exported')).length
  // Any inbound response counts toward reply rate: the auto-detected neutral
  // 'replied' state plus the manually-triaged interested/not_interested.
  const replied = views.filter((v) => v.disposition === 'replied' || v.disposition === 'interested' || v.disposition === 'not_interested').length
  const counts = {
    total: views.length,
    new: views.filter((v) => v.status === 'new').length,
    personalized: views.filter((v) => v.draft && !v.draft.is_template).length,
    templates: views.filter((v) => v.draft && v.draft.is_template).length,
    approved: views.filter((v) => v.draft?.status === 'approved').length,
    exported: views.filter((v) => v.draft?.status === 'exported').length,
    needs_review: views.filter((v) => v.needs_review).length,
    sent,
    replied,
    bounced: views.filter((v) => v.disposition === 'bounced').length,
    unsubscribed: views.filter((v) => v.disposition === 'unsubscribed').length,
    queued,
  }
  const reply_rate = sent > 0 ? replied / sent : 0

  const settings = await loadSettings(supabase, companyId)
  const { rate: bounce_rate_7d } = await recentBounceStats(supabase, companyId, 7)
  // Gmail health: token refresh failures mark the account 'error', which makes
  // the worker/scanner silently skip — surface it so the user can reconnect.
  let gmail: OutreachSnapshot['sending']['gmail'] = null
  if (settings.provider === 'gmail') {
    const account = await getAccount(companyId, 'gmail')
    gmail = account
      ? { status: account.status, last_error: account.last_error }
      : { status: 'not_connected', last_error: null }
  }
  const sending = {
    active: settings.active,
    pause_reason: settings.pause_reason,
    effective_daily_cap: getEffectiveDailyCap(settings),
    bounce_rate_7d,
    provider: settings.provider,
    gmail,
  }

  return { prospects: views, counts, reply_rate, cost_usd_total, sending }
}

// ── Outcomes ──────────────────────────────────────────────────────────────────

/** Record the conversation outcome for a prospect (manual, post-send). A
 * non-'open' disposition closes the prospect and suppresses follow-ups. */
export async function setDisposition(
  companyId: string,
  prospectId: string,
  disposition: Disposition,
): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_prospects')
    .update({ disposition, disposition_at: disposition === 'open' ? null : new Date().toISOString() })
    .eq('id', prospectId)
    .eq('company_id', companyId)
  if (error) return { ok: false, error: 'Could not update the outcome.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

/** Permanently delete prospects (cascades to their drafts + sends). */
export async function deleteProspects(
  companyId: string,
  prospectIds: string[],
): Promise<ActionResult<{ deleted: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (prospectIds.length === 0) return { ok: true, data: { deleted: 0 } }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outreach_prospects')
    .delete()
    .eq('company_id', companyId)
    .in('id', prospectIds)
    .select('id')
  if (error) return { ok: false, error: 'Could not delete the prospects.' }
  revalidatePath('/outreach')
  return { ok: true, data: { deleted: data?.length ?? 0 } }
}

// ── Follow-ups ────────────────────────────────────────────────────────────────

/**
 * Generate the next touch (follow-up) for a prospect on demand. Reuses the
 * prospect's already-verified facts/angle from the initial personalized draft
 * (no re-enrichment, no re-synthesis — one Sonnet draft call), or a generic
 * follow-up template when the prospect was never personalized. Blocked once the
 * prospect is closed (replied / bounced / unsubscribed).
 */
export async function generateFollowup(companyId: string, prospectId: string): Promise<ActionResult> {
  let access: Awaited<ReturnType<typeof requireCompanyAccess>>
  try {
    access = await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }

  const supabase = await createClient()
  const { data: p } = await supabase
    .from('outreach_prospects')
    .select('id, recipient_name, disposition')
    .eq('id', prospectId)
    .eq('company_id', companyId)
    .single()
  if (!p) return { ok: false, error: 'Prospect not found.' }
  if (p.disposition !== 'open') {
    return { ok: false, error: 'This prospect is closed (replied, bounced, or unsubscribed). Reopen it to add a follow-up.' }
  }

  const { data: existing } = await supabase
    .from('outreach_drafts')
    .select('subject, angle, synthesis_confidence, facts_for_draft, step')
    .eq('prospect_id', prospectId)
    .eq('company_id', companyId)
    .order('step', { ascending: true })
  if (!existing || existing.length === 0) {
    return { ok: false, error: 'No initial draft to follow up on yet.' }
  }

  const nextStep = Math.max(...existing.map((d) => d.step)) + 1
  const priorSubject = existing[existing.length - 1].subject
  // Reuse the verified facts/angle from the personalized touch when there is one.
  const personalized = existing.find((d) => asStringArray(d.facts_for_draft).length > 0)

  const usage: LLMUsage[] = []
  let row: {
    subject: string
    body: string
    angle: string | null
    synthesis_confidence: number | null
    facts_for_draft: string[]
    facts_used: string[]
    drifted_facts: string[]
    clean: boolean
  }

  if (personalized) {
    const facts = asStringArray(personalized.facts_for_draft)
    const synthesis: SynthesisResult = {
      skip: false,
      skip_reason: null,
      confidence: personalized.synthesis_confidence ?? 1,
      angle: personalized.angle,
      facts_for_draft: facts,
    }
    const review = await draftEmail(synthesis, usage, { step: nextStep, priorSubject })
    if (!review) return { ok: false, error: 'Could not draft a follow-up. Try again.' }
    row = {
      subject: review.draft.subject,
      body: review.draft.body,
      angle: personalized.angle,
      synthesis_confidence: personalized.synthesis_confidence,
      facts_for_draft: facts,
      facts_used: review.draft.facts_used,
      drifted_facts: review.drifted_facts,
      clean: review.clean,
    }
  } else {
    const tmpl = buildTemplateFollowup(p.recipient_name ?? null)
    row = {
      subject: tmpl.subject,
      body: tmpl.body,
      angle: null,
      synthesis_confidence: null,
      facts_for_draft: [],
      facts_used: [],
      drifted_facts: [],
      clean: true,
    }
  }

  const { error } = await supabase.from('outreach_drafts').insert({
    prospect_id: prospectId,
    company_id: companyId,
    step: nextStep,
    status: 'pending',
    ...row,
  })
  if (error) return { ok: false, error: 'Could not save the follow-up.' }

  if (usage.length > 0) await recordUsage(supabase, companyId, access.userId, usage)
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

// ── Review actions ────────────────────────────────────────────────────────────

async function setDraftStatus(
  companyId: string,
  draftId: string,
  patch: { status: 'approved' | 'edited' | 'rejected'; subject?: string; body?: string },
): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_drafts')
    .update({ ...patch, reviewed_at: new Date().toISOString() })
    .eq('id', draftId)
    .eq('company_id', companyId)
  if (error) return { ok: false, error: 'Could not update the draft.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

export async function approveDraft(companyId: string, draftId: string): Promise<ActionResult> {
  return setDraftStatus(companyId, draftId, { status: 'approved' })
}

/** Bulk-approve the given draft ids (e.g. all pending templates, or all to-review). */
export async function approveDrafts(
  companyId: string,
  draftIds: string[],
): Promise<ActionResult<{ count: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (draftIds.length === 0) return { ok: true, data: { count: 0 } }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outreach_drafts')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .in('id', draftIds)
    .select('id')
  if (error) return { ok: false, error: 'Could not approve the drafts.' }
  revalidatePath('/outreach')
  return { ok: true, data: { count: data?.length ?? 0 } }
}

/** Move approved drafts to 'exported' (downloaded + sent) so Approved stays lean. */
export async function markExported(
  companyId: string,
  draftIds: string[],
): Promise<ActionResult<{ count: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (draftIds.length === 0) return { ok: true, data: { count: 0 } }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outreach_drafts')
    .update({ status: 'exported', reviewed_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .in('id', draftIds)
    .select('id')
  if (error) return { ok: false, error: 'Could not mark the drafts exported.' }
  revalidatePath('/outreach')
  return { ok: true, data: { count: data?.length ?? 0 } }
}

/** Manual disambiguation: re-run a prospect against an explicit company name. */
export async function resolveManual(
  companyId: string,
  prospectId: string,
  companyName: string,
): Promise<ActionResult<{ status: 'drafted' | 'skipped' }>> {
  let access: Awaited<ReturnType<typeof requireCompanyAccess>>
  try {
    access = await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const name = companyName.trim()
  if (!name) return { ok: false, error: 'Enter a company name to resolve against.' }

  const supabase = await createClient()
  const { data: prospect } = await supabase
    .from('outreach_prospects')
    .select('email')
    .eq('id', prospectId)
    .eq('company_id', companyId)
    .single()
  if (!prospect) return { ok: false, error: 'Prospect not found.' }

  const usage: LLMUsage[] = []
  const outcome = await runPipelineFromName(prospect.email, name, usage)
  await persistOutcome(supabase, companyId, prospectId, outcome)
  await recordUsage(supabase, companyId, access.userId, usage)
  revalidatePath('/outreach')
  return { ok: true, data: { status: outcome.status } }
}

export async function rejectDraft(companyId: string, draftId: string): Promise<ActionResult> {
  return setDraftStatus(companyId, draftId, { status: 'rejected' })
}

export async function editDraft(
  companyId: string,
  draftId: string,
  subject: string,
  body: string,
): Promise<ActionResult> {
  const s = subject.trim()
  const b = body.trim()
  if (!s || !b) return { ok: false, error: 'Subject and body cannot be empty.' }
  return setDraftStatus(companyId, draftId, { status: 'edited', subject: s, body: b })
}
