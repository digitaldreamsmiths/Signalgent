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
import { usesUsaspending } from './usaspending-preference'
import { fetchAllPages } from './fetch-all'
import { loadOfferProfile, DEFAULT_OFFER_PROFILE, type OfferProfile } from './offer-profile'
import { enrichmentHeadroom } from '@/lib/billing/billing'
import { applyGreeting, fetchStoredContactNames, resolveContactName } from './contact-name'
import { buildTemplateDraft, renderTemplate } from './template'
import { pickWeighted, templatesForCampaign } from './template-pool'
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
 * random pick among the company's ACTIVE user templates that apply to the
 * prospect's campaign (its own templates if it has any, else the shared ones),
 * or the built-in default when none apply. Returns the rendered draft plus the
 * template_id to stamp (null for the built-in) so per-template performance can
 * be tracked.
 *
 * `campaignId` undefined = look the prospect up (callers that only hold an id);
 * null = the campaign-less pool. */
export async function pickTemplateDraft(
  supabase: DB,
  companyId: string,
  recipientName: string | null,
  prospectId: string,
  profile: OfferProfile = DEFAULT_OFFER_PROFILE,
  federal = true,
  campaignId?: string | null,
): Promise<{ draft: DraftResult; template_id: string | null }> {
  const active = await loadActiveTemplates(supabase, companyId)
  let scope = campaignId
  if (scope === undefined) {
    const { data: p } = await supabase.from('outreach_prospects').select('campaign_id').eq('id', prospectId).eq('company_id', companyId).maybeSingle()
    scope = p?.campaign_id ?? null
  }
  const chosen = pickWeighted(templatesForCampaign(active, scope))
  // No applicable user templates: rotate the five built-in variants instead of
  // sending one email to everybody. Keyed off the prospect id rather than
  // randomly, so a later follow-up derives the same variant without a column
  // to remember it.
  if (!chosen) return { draft: buildTemplateDraft(recipientName, prospectId, profile, federal), template_id: null }
  return { draft: renderTemplate(chosen, recipientName), template_id: chosen.id }
}

export interface ActiveTemplate { id: string; subject: string; body: string; weight: number; campaign_id?: string | null }

/** The company's active templates with their campaign scope. `campaign_id`
 * arrives via an out-of-band migration; before it, the read retries without
 * the column and every template counts as shared, which is the old behavior. */
export async function loadActiveTemplates(supabase: DB, companyId: string): Promise<ActiveTemplate[]> {
  const { data, error } = await supabase
    .from('outreach_templates')
    .select('id, subject, body, weight, campaign_id')
    .eq('company_id', companyId)
    .eq('active', true)
  if (!error) return (data ?? []) as ActiveTemplate[]
  const { data: plain } = await supabase
    .from('outreach_templates')
    .select('id, subject, body, weight')
    .eq('company_id', companyId)
    .eq('active', true)
  return (plain ?? []) as ActiveTemplate[]
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
  const federal = await usesUsaspending(supabase, companyId)
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
    // Templates are pre-approved copy, so they skip text review. A person
    // must still schedule the send explicitly.
    const { draft: tmpl, template_id } = await pickTemplateDraft(supabase, companyId, enriched?.recipient_name ?? null, prospectId, profile, federal)
    await supabase
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
      .select('id, recipient_name, email, campaign_id')
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
  const federal = await usesUsaspending(supabase, companyId)
  const storedNames = await fetchStoredContactNames(supabase, companyId, missing.map((p) => p.id))
  const rows = []
  for (const p of missing) {
    const { draft: tmpl, template_id } = await pickTemplateDraft(supabase, companyId, p.recipient_name ?? null, p.id, profile, federal, p.campaign_id ?? null)
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
  const { error } = await supabase
    .from('outreach_drafts')
    .upsert(rows, { onConflict: 'prospect_id,step' })
  if (error) return 0
  return rows.length
}

/** Which prospects a wave or batch may draw from, mirroring the workspace's
 * campaign picker: undefined = the whole company, null = prospects in no
 * campaign, a string = that campaign's prospects. */
export type CampaignScope = string | null | undefined

/** Apply a campaign scope to a prospects query. Generic over the builder so it
 * works for both row selects and head counts. */
export function scopeProspects<Q extends { eq(column: string, value: string): Q; is(column: string, value: null): Q }>(q: Q, scope: CampaignScope): Q {
  if (scope === undefined) return q
  return scope === null ? q.is('campaign_id', null) : q.eq('campaign_id', scope)
}

async function countNew(supabase: DB, companyId: string, scope: CampaignScope): Promise<number> {
  const { count } = await scopeProspects(
    supabase.from('outreach_prospects').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'new'),
    scope,
  )
  return count ?? 0
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

/** Run the pipeline over up to `limit` oldest `new` prospects (FIFO) within
 * `scope`. Idempotent: processed prospects leave 'new', so partial runs resume
 * cleanly next call. */
export async function runEnrichmentBatch(supabase: DB, companyId: string, limit: number, userId: string | null, scope: CampaignScope = undefined): Promise<EnrichBatchResult> {
  // Plan quota first: enrichment is the LLM spend, so an exhausted month has to
  // stop before any calls are made. Infinity for unmanaged/uncapped tenants.
  const useUsaspending = await usesUsaspending(supabase, companyId)
  const headroom = useUsaspending ? await enrichmentHeadroom(supabase, companyId) : Infinity
  if (headroom <= 0) {
    await backfillTemplateDrafts(supabase, companyId)
    return { processed: 0, drafted: 0, skipped: 0, remaining: await countNew(supabase, companyId, scope), cost_usd: 0, quota_exhausted: true }
  }

  const { data: pending, error } = await scopeProspects(
    supabase
      .from('outreach_prospects')
      .select('id, email')
      .eq('company_id', companyId)
      .eq('status', 'new'),
    scope,
  )
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
    const outcome: PipelineOutcome = useUsaspending
      ? await runPipeline(p.email, usage, profile)
      : { status: 'skipped', email: p.email, stage: 'enrich', reason: 'USAspending search disabled for this company' }
    await persistOutcome(supabase, companyId, p.id, outcome, profile, resolveContactName(storedNames.get(p.id), p.email))
    if (outcome.status === 'drafted') drafted += 1
    else skipped += 1
  }
  await recordUsage(supabase, companyId, userId, usage)
  await backfillTemplateDrafts(supabase, companyId)

  const cost_usd = usage.reduce((s, u) => s + usageCostUsd(u), 0)
  return { processed: pending.length, drafted, skipped, remaining: await countNew(supabase, companyId, scope), cost_usd }
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
  const useUsaspending = await usesUsaspending(supabase, companyId)
  const headroom = useUsaspending ? await enrichmentHeadroom(supabase, companyId) : Infinity
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
    const outcome: PipelineOutcome = useUsaspending
      ? await runPipeline(p.email, usage, profile)
      : { status: 'skipped', email: p.email, stage: 'enrich', reason: 'USAspending search disabled for this company' }
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
 * fresh without draining the whole list.
 *
 * With a campaign `scope`, both the buffer and the draw are measured inside
 * that campaign: a church list with three days of drafts ready must not stop
 * the school list from getting its first wave, and the school wave must not
 * pull church prospects because they are older. */
export async function enrichToBuffer(supabase: DB, companyId: string, userId: string | null, scope: CampaignScope = undefined): Promise<EnrichWaveResult> {
  const settings = await loadSettings(supabase, companyId)
  const target = WAVE_DAYS * getEffectiveDailyCap(settings)

  let buffer = await countBuffer(supabase, companyId, scope)

  let enriched = 0
  let drafted = 0
  let skipped = 0
  let cost = 0
  let remaining = 0
  let ranAny = false
  let quotaExhausted = false
  for (let guard = 0; buffer < target && guard < 50; guard++) {
    const need = Math.min(target - buffer, RUN_BATCH)
    const r = await runEnrichmentBatch(supabase, companyId, need, userId, scope)
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

  if (!ranAny) remaining = await countNew(supabase, companyId, scope)

  return {
    enriched,
    drafted,
    skipped,
    remaining,
    cost_usd: cost,
    note: quotaExhausted
      ? 'monthly enrichment limit reached for this plan'
      : enriched === 0
        ? (remaining === 0 ? (scope === undefined ? 'no new prospects' : 'no new prospects in this campaign') : `buffer full (${buffer}/${target} ready${scope === undefined ? '' : ' in this campaign'})`)
        : undefined,
  }
}

/** Enriched prospects whose draft hasn't been sent yet (pending / approved /
 * edited drafts). Drafts carry no campaign column, so a scoped count filters
 * through the prospect join; if that read fails the company-wide count stands
 * in, which can only make the wave smaller, never cross-campaign. */
async function countBuffer(supabase: DB, companyId: string, scope: CampaignScope): Promise<number> {
  const unscoped = () => supabase
    .from('outreach_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ['pending', 'approved', 'edited'])
  if (scope === undefined) return (await unscoped()).count ?? 0
  let q = supabase
    .from('outreach_drafts')
    .select('id, outreach_prospects!inner(campaign_id)', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ['pending', 'approved', 'edited'])
  q = scope === null ? q.is('outreach_prospects.campaign_id', null) : q.eq('outreach_prospects.campaign_id', scope)
  const { count, error } = await q
  if (!error) return count ?? 0
  return (await unscoped()).count ?? 0
}
