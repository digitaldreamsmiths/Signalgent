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
import { buildTemplateDraft } from './template'
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

/** Persist a pipeline outcome for a prospect (shared by run + manual resolve). */
export async function persistOutcome(supabase: DB, companyId: string, prospectId: string, outcome: PipelineOutcome): Promise<void> {
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
        step: 1,
      },
      { onConflict: 'prospect_id,step' },
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
        step: 1,
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
  const { data: skipped } = await supabase
    .from('outreach_prospects')
    .select('id, recipient_name')
    .eq('company_id', companyId)
    .eq('status', 'skipped')
  if (!skipped || skipped.length === 0) return 0

  const { data: drafts } = await supabase.from('outreach_drafts').select('prospect_id').eq('company_id', companyId)
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
      step: 1,
    }
  })
  const { error } = await supabase.from('outreach_drafts').upsert(rows, { onConflict: 'prospect_id,step' })
  return error ? 0 : rows.length
}

export interface EnrichBatchResult {
  processed: number
  drafted: number
  skipped: number
  remaining: number
  cost_usd: number
}

/** Run the pipeline over up to `limit` oldest `new` prospects (FIFO). Idempotent:
 * processed prospects leave 'new', so partial runs resume cleanly next call. */
export async function runEnrichmentBatch(supabase: DB, companyId: string, limit: number, userId: string | null): Promise<EnrichBatchResult> {
  const { data: pending, error } = await supabase
    .from('outreach_prospects')
    .select('id, email')
    .eq('company_id', companyId)
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, RUN_BATCH)))

  if (error || !pending || pending.length === 0) {
    await backfillTemplateDrafts(supabase, companyId)
    return { processed: 0, drafted: 0, skipped: 0, remaining: 0, cost_usd: 0 }
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
  for (let guard = 0; buffer < target && guard < 50; guard++) {
    const need = Math.min(target - buffer, RUN_BATCH)
    const r = await runEnrichmentBatch(supabase, companyId, need, userId)
    ranAny = true
    remaining = r.remaining
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
    note: enriched === 0 ? (remaining === 0 ? 'no new prospects' : `buffer full (${buffer}/${target} ready)`) : undefined,
  }
}
