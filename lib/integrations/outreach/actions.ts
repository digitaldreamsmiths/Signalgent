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
import type { Database, Json } from '@/lib/types/database.types'
import { extractDomain } from '../usaspending/resolve'
import { runPipeline, runPipelineFromName, type PipelineOutcome } from './pipeline'
import { buildTemplateDraft } from './template'
import type { LLMUsage } from '../../llm/client'
import type {
  ActionResult,
  Disposition,
  OutreachDraftView,
  OutreachProspectView,
  OutreachSnapshot,
} from './types'

type ProspectUpdate = Database['public']['Tables']['outreach_prospects']['Update']
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const AUTH_ERROR = 'You don’t have access to this workspace.'

/** Hard cap on prospects enriched per runNewProspects call (bounds request time).
 * The client loops, calling with a smaller chunk size, to process larger lists. */
const RUN_BATCH = 15

/** Per-1M-token prices ($) by model, for api_usage cost. */
const PRICE: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
}

function usageCostUsd(u: LLMUsage): number {
  const p = PRICE[u.model] ?? { in: 0, out: 0 }
  return (u.inputTokens / 1e6) * p.in + (u.outputTokens / 1e6) * p.out
}

/** Record per-call LLM usage to api_usage. Best-effort. */
async function recordUsage(
  supabase: SupabaseServerClient,
  companyId: string,
  userId: string,
  usage: LLMUsage[],
): Promise<void> {
  if (usage.length === 0) return
  const rows = usage.map((u) => ({
    company_id: companyId,
    user_id: userId,
    service: 'anthropic' as const,
    model: u.model,
    input_tokens: u.inputTokens,
    output_tokens: u.outputTokens,
    cost_usd: Math.round(usageCostUsd(u) * 1e6) / 1e6,
    feature: `outreach:${u.task}`,
  }))
  await supabase.from('api_usage').insert(rows)
}

/** Persist a pipeline outcome for a prospect (shared by run + manual resolve). */
async function persistOutcome(
  supabase: SupabaseServerClient,
  companyId: string,
  prospectId: string,
  outcome: PipelineOutcome,
): Promise<void> {
  const enriched = 'enriched' in outcome ? outcome.enriched : undefined
  const prospectUpdate: ProspectUpdate = { enriched_at: new Date().toISOString() }
  if (enriched) {
    prospectUpdate.recipient_name = enriched.recipient_name
    prospectUpdate.recipient_id = enriched.recipient_id
    prospectUpdate.uei = enriched.uei
    prospectUpdate.resolution_confidence = enriched.resolution_confidence
    prospectUpdate.resolution_method = enriched.resolution_method
    prospectUpdate.business_types = enriched.business_types
    prospectUpdate.location = enriched.location
    prospectUpdate.footprint = enriched.footprint as unknown as Json
  }

  if (outcome.status === 'drafted') {
    prospectUpdate.status = 'drafted'
    prospectUpdate.skip_stage = null
    prospectUpdate.skip_reason = null
    await supabase.from('outreach_prospects').update(prospectUpdate).eq('id', prospectId).eq('company_id', companyId)
    await supabase.from('outreach_drafts').upsert(
      {
        prospect_id: prospectId,
        company_id: companyId,
        subject: outcome.review.draft.subject,
        body: outcome.review.draft.body,
        angle: outcome.synthesis.angle,
        synthesis_confidence: outcome.synthesis.confidence,
        facts_for_draft: outcome.synthesis.facts_for_draft,
        facts_used: outcome.review.draft.facts_used,
        drifted_facts: outcome.review.drifted_facts,
        clean: outcome.review.clean,
        status: 'pending',
      },
      { onConflict: 'prospect_id' },
    )
  } else {
    prospectUpdate.status = 'skipped'
    prospectUpdate.skip_stage = outcome.stage
    prospectUpdate.skip_reason = outcome.reason
    await supabase.from('outreach_prospects').update(prospectUpdate).eq('id', prospectId).eq('company_id', companyId)
    // Can't personalize -> attach a generic, sendable template (empty
    // facts_for_draft marks it as a template, no fabricated claims).
    const tmpl = buildTemplateDraft(enriched?.recipient_name ?? null)
    await supabase.from('outreach_drafts').upsert(
      {
        prospect_id: prospectId,
        company_id: companyId,
        subject: tmpl.subject,
        body: tmpl.body,
        angle: null,
        synthesis_confidence: null,
        facts_for_draft: [],
        facts_used: [],
        drifted_facts: [],
        clean: true,
        status: 'pending',
      },
      { onConflict: 'prospect_id' },
    )
  }
}

/**
 * Safeguard: every skipped prospect should carry at least the generic template
 * draft (the fallback that keeps un-personalizable prospects sendable). Legacy
 * rows from before the fallback existed — and any where persistOutcome's draft
 * upsert silently failed — get stranded: counted in the total but with no draft,
 * so they're invisible in the queue and not re-enrichable. This idempotent sweep
 * creates the missing template drafts. Returns how many it created.
 */
async function backfillTemplateDrafts(supabase: SupabaseServerClient, companyId: string): Promise<number> {
  const { data: skipped } = await supabase
    .from('outreach_prospects')
    .select('id, recipient_name')
    .eq('company_id', companyId)
    .eq('status', 'skipped')
  if (!skipped || skipped.length === 0) return 0

  const { data: drafts } = await supabase
    .from('outreach_drafts')
    .select('prospect_id')
    .eq('company_id', companyId)
  const haveDraft = new Set((drafts ?? []).map((d) => d.prospect_id))

  const missing = skipped.filter((p) => !haveDraft.has(p.id))
  if (missing.length === 0) return 0

  const rows = missing.map((p) => {
    const tmpl = buildTemplateDraft(p.recipient_name ?? null)
    return {
      prospect_id: p.id,
      company_id: companyId,
      subject: tmpl.subject,
      body: tmpl.body,
      angle: null,
      synthesis_confidence: null,
      facts_for_draft: [],
      facts_used: [],
      drifted_facts: [],
      clean: true,
      status: 'pending' as const,
    }
  })
  const { error } = await supabase.from('outreach_drafts').upsert(rows, { onConflict: 'prospect_id' })
  return error ? 0 : rows.length
}

// ── Ingest ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g

export async function ingestProspects(
  companyId: string,
  raw: string,
): Promise<ActionResult<{ added: number; duplicates: number; invalid: number }>> {
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
    return { ok: true, data: { added: 0, duplicates: 0, invalid } }
  }

  const supabase = await createClient()
  // Insert, ignoring rows that already exist (unique company_id+email).
  const { data, error } = await supabase
    .from('outreach_prospects')
    .upsert(rows, { onConflict: 'company_id,email', ignoreDuplicates: true })
    .select('id')

  if (error) return { ok: false, error: 'Could not save prospects. Try again.' }

  const added = data?.length ?? 0
  revalidatePath('/outreach')
  return { ok: true, data: { added, duplicates: rows.length - added, invalid } }
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
  const { data: pending, error } = await supabase
    .from('outreach_prospects')
    .select('id, email')
    .eq('company_id', companyId)
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, RUN_BATCH)))

  if (error) return { ok: false, error: 'Could not load prospects.' }
  if (!pending || pending.length === 0) {
    await backfillTemplateDrafts(supabase, companyId)
    return { ok: true, data: { processed: 0, drafted: 0, skipped: 0, remaining: 0, cost_usd: 0 } }
  }

  const usage: LLMUsage[] = []
  let drafted = 0
  let skipped = 0
  for (const p of pending) {
    const outcome = await runPipeline(p.email, usage)
    await persistOutcome(supabase, companyId, p.id, outcome)
    if (outcome.status === 'drafted') drafted += 1
    else skipped += 1
  }

  await recordUsage(supabase, companyId, access.userId, usage)
  const cost_usd = usage.reduce((s, u) => s + usageCostUsd(u), 0)

  // Safeguard: ensure no prospect skipped this run was left without a draft.
  await backfillTemplateDrafts(supabase, companyId)

  const { count } = await supabase
    .from('outreach_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'new')

  revalidatePath('/outreach')
  return { ok: true, data: { processed: pending.length, drafted, skipped, remaining: count ?? 0, cost_usd } }
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
  const [{ data: prospects }, { data: drafts }, { data: usageRows }] = await Promise.all([
    supabase.from('outreach_prospects').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('outreach_drafts').select('*').eq('company_id', companyId),
    supabase.from('api_usage').select('cost_usd').eq('company_id', companyId).like('feature', 'outreach:%'),
  ])

  const cost_usd_total = (usageRows ?? []).reduce((s, r) => s + (r.cost_usd ?? 0), 0)

  const draftByProspect = new Map<string, OutreachDraftView>()
  for (const d of drafts ?? []) {
    const facts = asStringArray(d.facts_for_draft)
    draftByProspect.set(d.prospect_id, {
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
      is_template: facts.length === 0,
    })
  }

  const views: OutreachProspectView[] = (prospects ?? []).map((p) => {
    const fp = p.footprint as { award_count?: number; sampled_total?: number } | null
    return {
      id: p.id,
      email: p.email,
      domain: p.domain,
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
      draft: draftByProspect.get(p.id) ?? null,
      disposition: p.disposition,
      disposition_at: p.disposition_at,
      // A plausible-but-uncertain resolver result (low confidence) — surfaced
      // for manual disambiguation rather than left as a silent skip.
      needs_review:
        p.status === 'skipped' &&
        p.skip_stage === 'enrich' &&
        (p.skip_reason ?? '').startsWith('low_confidence'),
    }
  })

  const sent = views.filter((v) => v.draft?.status === 'exported').length
  const replied = views.filter((v) => v.disposition === 'interested' || v.disposition === 'not_interested').length
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
  }
  const reply_rate = sent > 0 ? replied / sent : 0

  return { prospects: views, counts, reply_rate, cost_usd_total }
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
