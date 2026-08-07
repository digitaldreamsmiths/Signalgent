/**
 * Enrichment core — the resolve→synthesize→draft pipeline run over `new`
 * prospects, plus the cost/outcome persistence helpers. Plain module (NOT
 * 'use server') so it runs under both the user-scoped server actions
 * (`runNewProspects`, `enrichWaveNow`) and the unauthenticated cron
 * (service-role client, `userId = null`).
 *
 * Wave-based: rather than draining the whole `new` pool at once, `enrichToBuffer`
 * keeps roughly WAVE_DAYS of send capacity enriched-and-ready, so time-sensitive
 * federal-award facts stay fresh instead of going stale weeks before sending.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database.types'
import { runPipeline, type PipelineOutcome } from './pipeline'
import { fetchAllPages } from './fetch-all'
import { loadOfferProfile, DEFAULT_OFFER_PROFILE, type OfferProfile } from './offer-profile'
import { enrichmentHeadroom } from '@/lib/billing/billing'
import { applyGreeting, fetchStoredContactNames, resolveContactName } from './contact-name'
import { autoQueueDraftSend } from './send/queue'
import { buildTemplateDraft, renderTemplate } from './template'
import type { DraftResult } from './types'
import type { LLMUsage } from '../../llm/client'
import { loadSettings, getEffectiveDailyCap } from './send/worker'

type DB = SupabaseClient<Database>
type ProspectUpdate = Database['public']['Tables']['outreach_prospects']['Update']

/** Hard cap per pipeline batch — bounds request time; callers loop for more. */
export const RUN_BATCH = 15
/** Days of send capacity to keep enriched-and-ready. */
const WAVE_DAYS = 3

/** Per-1M-token prices ($) by model, for api_usage cost. */
const PRICE: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
}

export function usageCostUsd(u: LLMUsage): number {
  const p = PRICE[u.model] ?? { in: 0, out: 0 }
  return (u.inputTokens / 1e6) * p.in + (u.outputTokens / 1e6) * p.out
}

/** Record per-call LLM usage to api_usage. Best-effort. `userId` is null for
 * cron-driven (unattributed) enrichment — the column is nullable. */
export async function recordUsage(supabase: DB, companyId: string, userId: string | null, usage: LLMUsage[]): Promise<void> {
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

/** Choose a fallback draft for a prospect we couldn't personalize: a weighted-
 * random pick among the company's ACTIVE user templates, or the built-in default
 * when none are defined. Returns the rendered draft plus the template_id to stamp
 * (null for the built-in) so per-template performance can be tracked. */
async function pickTemplateDraft(
  supabase: DB,
  companyId: string,
  recipientName: string | null,
  prospectId: string,
  profile: OfferProfile = DEFAULT_OFFER_PROFILE,
): Promise<{ draft: DraftResult; template_id: string | null }> {
  const { data: templates } = await supabase
    .from('outreach_templates')
    .select('id, subject, body, weight')
    .eq('company_id', companyId)
    .eq('active', true)
  const active = templates ?? []
  // No user templates: rotate the five built-in variants instead of sending one
  // email to everybody. Keyed off the prospect id rather than randomly, so a
  // later follow-up derives the same variant without a column to remember it.
  if (active.length === 0) return { draft: buildTemplateDraft(recipientName, prospectId, profile), template_id: null }

  // Weighted random across the active set.
  const total = active.reduce((s, t) => s + Math.max(1, t.weight), 0)
  let r = Math.random() * total
  let chosen = active[active.length - 1]
  for (const t of active) {
    r -= Math.max(1, t.weight)
    if (r < 0) { chosen = t; break }
  }
  return { draft: renderTemplate(chosen, recipientName), template_id: chosen.id }
}

/** Persist a pipeline outcome for a prospect (shared by run + manual resolve).
 * `contactName` (resolved override-or-parse) bakes the "Hi {first}," greeting
 * into the stored draft, so the review queue shows exactly what sends. */
export async function persistOutcome(
  supabase: DB,
  companyId: string,
  prospectId: string,
  outcome: PipelineOutcome,
  profile: OfferProfile = DEFAULT_OFFER_PROFILE,
  contactName: string | null = null,
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
        body: applyGreeting(outcome.review.draft.body, contactName),
        angle: outcome.synthesis.angle,
        synthesis_confidence: outcome.synthesis.confidence,
        facts_for_draft: outcome.synthesis.facts_for_draft,
        facts_used: outcome.review.draft.facts_used,
        drifted_facts: outcome.review.drifted_facts,
        clean: outcome.review.clean,
        status: 'pending',
        step: 1,
        template_id: null, // personalized draft
      },
      { onConflict: 'prospect_id,step' },
    )
  } else {
    prospectUpdate.status = 'skipped'
    prospectUpdate.skip_stage = outcome.stage
    prospectUpdate.skip_reason = outcome.reason
    await supabase.from('outreach_prospects').update(prospectUpdate).eq('id', prospectId).eq('company_id', companyId)
    // Can't personalize -> attach a generic, sendable template (empty
    // facts_for_draft marks it as a template, no fabricated claims). Rotate a
    // random active user template, stamping template_id for performance tracking.
    // Templates are pre-approved copy, so the draft skips review ('approved')
    // and goes straight for the send queue; autoQueueDraftSend silently leaves
    // it in Ready to email when sending isn't configured yet.
    const { draft: tmpl, template_id } = await pickTemplateDraft(supabase, companyId, enriched?.recipient_name ?? null, prospectId, profile)
    const { data: created } = await supabase
      .from('outreach_drafts')
      .upsert(
        {
          prospect_id: prospectId,
          company_id: companyId,
          subject: tmpl.subject,
          body: applyGreeting(tmpl.body, contactName),
          angle: null,
          synthesis_confidence: null,
          facts_for_draft: [],
          facts_used: [],
          drifted_facts: [],
          clean: true,
          status: 'approved',
          step: 1,
          template_id,
        },
        { onConflict: 'prospect_id,step' },
      )
      .select('id')
      .maybeSingle()
    if (created) await autoQueueDraftSend(supabase, companyId, created.id)
  }
}

/**
 * Safeguard: every skipped prospect should carry at least the generic template
 * draft. Idempotent sweep that creates any missing template drafts so no prospect
 * is left stranded (counted but invisible in the queue). Returns how many created.
 */
export async function backfillTemplateDrafts(supabase: DB, companyId: string): Promise<number> {
  // Paged: both tables grow with the prospect list and outrun the silent
  // 1,000-row cap; a capped drafts read would misread existing drafts as
  // missing and a capped skipped read would strand the tail.
  const skipped = await fetchAllPages((from, to) =>
    supabase
      .from('outreach_prospects')
      .select('id, recipient_name, email')
      .eq('company_id', companyId)
      .eq('status', 'skipped')
      .order('id')
      .range(from, to),
  )
  if (skipped.length === 0) return 0

  const drafts = await fetchAllPages((from, to) =>
    supabase.from('outreach_drafts').select('prospect_id').eq('company_id', companyId).order('id').range(from, to),
  )
  const haveDraft = new Set(drafts.map((d) => d.prospect_id))

  const missing = skipped.filter((p) => !haveDraft.has(p.id))
  if (missing.length === 0) return 0

  // Rotate independently per prospect so the fallback pool is spread across the list.
  const profile = await loadOfferProfile(supabase, companyId)
  const storedNames = await fetchStoredContactNames(supabase, companyId, missing.map((p) => p.id))
  const rows = []
  for (const p of missing) {
    const { draft: tmpl, template_id } = await pickTemplateDraft(supabase, companyId, p.recipient_name ?? null, p.id, profile)
    rows.push({
      prospect_id: p.id,
      company_id: companyId,
      subject: tmpl.subject,
      body: applyGreeting(tmpl.body, resolveContactName(storedNames.get(p.id), p.email)),
      angle: null,
      synthesis_confidence: null,
      facts_for_draft: [],
      facts_used: [],
      drifted_facts: [],
      clean: true,
      status: 'approved' as const, // templates are pre-approved copy — skip review
      step: 1,
      template_id,
    })
  }
  const { data: created, error } = await supabase
    .from('outreach_drafts')
    .upsert(rows, { onConflict: 'prospect_id,step' })
    .select('id')
  if (error) return 0
  for (const d of created ?? []) await autoQueueDraftSend(supabase, companyId, d.id)
  return rows.length
}

export interface EnrichBatchResult {
  processed: number
  drafted: number
  skipped: number
  remaining: number
  cost_usd: number
  /** Set when the monthly plan quota stopped the run, so the UI can say so
   * rather than reporting a silent "nothing to do". */
  quota_exhausted?: boolean
}

/** Run the pipeline over up to `limit` oldest `new` prospects (FIFO). Idempotent:
 * processed prospects leave 'new', so partial runs resume cleanly next call. */
export async function runEnrichmentBatch(supabase: DB, companyId: string, limit: number, userId: string | null): Promise<EnrichBatchResult> {
  // Plan quota first: enrichment is the LLM spend, so an exhausted month has to
  // stop before any calls are made. Infinity for unmanaged/uncapped tenants.
  const headroom = await enrichmentHeadroom(supabase, companyId)
  if (headroom <= 0) {
    await backfillTemplateDrafts(supabase, companyId)
    const { count } = await supabase
      .from('outreach_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'new')
    return { processed: 0, drafted: 0, skipped: 0, remaining: count ?? 0, cost_usd: 0, quota_exhausted: true }
  }

  const { data: pending, error } = await supabase
    .from('outreach_prospects')
    .select('id, email')
    .eq('company_id', companyId)
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, RUN_BATCH, headroom)))

  if (error || !pending || pending.length === 0) {
    await backfillTemplateDrafts(supabase, companyId)
    return { processed: 0, drafted: 0, skipped: 0, remaining: 0, cost_usd: 0 }
  }

  const profile = await loadOfferProfile(supabase, companyId)
  const storedNames = await fetchStoredContactNames(supabase, companyId, pending.map((p) => p.id))
  const usage: LLMUsage[] = []
  let drafted = 0
  let skipped = 0
  for (const p of pending) {
    const outcome = await runPipeline(p.email, usage, profile)
    await persistOutcome(supabase, companyId, p.id, outcome, profile, resolveContactName(storedNames.get(p.id), p.email))
    if (outcome.status === 'drafted') drafted += 1
    else skipped += 1
  }
  await recordUsage(supabase, companyId, userId, usage)
  await backfillTemplateDrafts(supabase, companyId)

  const { count } = await supabase
    .from('outreach_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'new')

  const cost_usd = usage.reduce((s, u) => s + usageCostUsd(u), 0)
  return { processed: pending.length, drafted, skipped, remaining: count ?? 0, cost_usd }
}

/** Like runEnrichmentBatch, but restricted to a caller-supplied set of prospect
 * ids and reporting exactly which ids it processed. Powers the Contacts tab's
 * "Process selected" action: it enriches precisely what the user picked and
 * bypasses the wave buffer cap, so a manual run isn't throttled by drip pacing.
 * The client loops (shrinking `ids` by `processedIds`) so large selections drain
 * a batch at a time. */
export async function runEnrichmentBatchForIds(
  supabase: DB,
  companyId: string,
  ids: string[],
  limit: number,
  userId: string | null,
): Promise<EnrichBatchResult & { processedIds: string[] }> {
  if (ids.length === 0) return { processed: 0, drafted: 0, skipped: 0, remaining: 0, cost_usd: 0, processedIds: [] }

  // Same quota gate as the wave path — a hand-picked "Process selected" spends
  // the same LLM budget as an automatic run.
  const headroom = await enrichmentHeadroom(supabase, companyId)
  if (headroom <= 0) {
    return { processed: 0, drafted: 0, skipped: 0, remaining: ids.length, cost_usd: 0, processedIds: [], quota_exhausted: true }
  }

  const { data: pending, error } = await supabase
    .from('outreach_prospects')
    .select('id, email')
    .eq('company_id', companyId)
    .eq('status', 'new')
    .in('id', ids)
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, RUN_BATCH, headroom)))

  if (error || !pending || pending.length === 0) {
    await backfillTemplateDrafts(supabase, companyId)
    return { processed: 0, drafted: 0, skipped: 0, remaining: 0, cost_usd: 0, processedIds: [] }
  }

  const profile = await loadOfferProfile(supabase, companyId)
  const storedNames = await fetchStoredContactNames(supabase, companyId, pending.map((p) => p.id))
  const usage: LLMUsage[] = []
  let drafted = 0
  let skipped = 0
  const processedIds: string[] = []
  for (const p of pending) {
    const outcome = await runPipeline(p.email, usage, profile)
    await persistOutcome(supabase, companyId, p.id, outcome, profile, resolveContactName(storedNames.get(p.id), p.email))
    processedIds.push(p.id)
    if (outcome.status === 'drafted') drafted += 1
    else skipped += 1
  }
  await recordUsage(supabase, companyId, userId, usage)
  await backfillTemplateDrafts(supabase, companyId)

  // Remaining = still-`new` prospects among the requested ids.
  const { count } = await supabase
    .from('outreach_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'new')
    .in('id', ids)

  const cost_usd = usage.reduce((s, u) => s + usageCostUsd(u), 0)
  return { processed: pending.length, drafted, skipped, remaining: count ?? 0, cost_usd, processedIds }
}

export interface EnrichWaveResult {
  enriched: number
  drafted: number
  skipped: number
  remaining: number
  cost_usd: number
  /** Set when nothing was enriched, explaining why (e.g. buffer full). */
  note?: string
}

/** Top up the enriched-and-ready buffer to ~WAVE_DAYS of send capacity. Enriches
 * only the gap (capped at one buffer's worth per call), so the cron keeps facts
 * fresh without draining the whole list. */
export async function enrichToBuffer(supabase: DB, companyId: string, userId: string | null): Promise<EnrichWaveResult> {
  const settings = await loadSettings(supabase, companyId)
  const target = WAVE_DAYS * getEffectiveDailyCap(settings)

  // Buffer = enriched prospects whose draft hasn't been sent yet.
  const { count: bufferCount } = await supabase
    .from('outreach_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ['pending', 'approved', 'edited'])
  let buffer = bufferCount ?? 0

  let enriched = 0
  let drafted = 0
  let skipped = 0
  let cost = 0
  let remaining = 0
  let ranAny = false
  let quotaExhausted = false
  for (let guard = 0; buffer < target && guard < 50; guard++) {
    const need = Math.min(target - buffer, RUN_BATCH)
    const r = await runEnrichmentBatch(supabase, companyId, need, userId)
    ranAny = true
    remaining = r.remaining
    if (r.quota_exhausted) quotaExhausted = true
    if (r.processed === 0) break
    enriched += r.processed
    drafted += r.drafted
    skipped += r.skipped
    cost += r.cost_usd
    buffer += r.processed
    if (r.remaining === 0) break
  }

  if (!ranAny) {
    const { count } = await supabase
      .from('outreach_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'new')
    remaining = count ?? 0
  }

  return {
    enriched,
    drafted,
    skipped,
    remaining,
    cost_usd: cost,
    note: quotaExhausted
      ? 'monthly enrichment limit reached for this plan'
      : enriched === 0
        ? (remaining === 0 ? 'no new prospects' : `buffer full (${buffer}/${target} ready)`)
        : undefined,
  }
}
