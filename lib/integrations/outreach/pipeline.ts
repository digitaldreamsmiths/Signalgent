/**
 * Outreach pipeline — one email through all four stages.
 *
 *   domain extraction (in resolver) → Stage 1 enrich → Stage 2 synthesize
 *   → confidence gate → Stage 3 draft → drift check
 *
 * Every exit is a typed PipelineOutcome so the review queue can show drafts vs.
 * the skip pile with reasons. Never throws. An optional `collect` array gathers
 * per-call LLM usage so the caller can record api_usage cost.
 */

import { enrichByName, enrichTarget, type EnrichResult } from './enrich'
import { synthesize } from './synthesize'
import { draftEmail } from './draft'
import type { DraftReview, EnrichedTarget, SynthesisResult } from './types'
import type { LLMUsage } from '../../llm/client'

export type PipelineOutcome =
  | { status: 'drafted'; email: string; enriched: EnrichedTarget; synthesis: SynthesisResult; review: DraftReview }
  | { status: 'skipped'; email: string; stage: 'enrich' | 'synthesis' | 'draft'; reason: string; enriched?: EnrichedTarget; synthesis?: SynthesisResult }

/** Shared tail: enrichment result → synthesize → gate → draft → outcome. */
async function fromEnriched(email: string, enriched: EnrichResult, collect?: LLMUsage[]): Promise<PipelineOutcome> {
  if (!enriched.ok) {
    return { status: 'skipped', email, stage: 'enrich', reason: `${enriched.reason}${enriched.detail ? `: ${enriched.detail}` : ''}` }
  }

  const synthesis = await synthesize(enriched.target, collect)
  if (synthesis.skip) {
    return { status: 'skipped', email, stage: 'synthesis', reason: synthesis.skip_reason ?? 'skip', enriched: enriched.target, synthesis }
  }

  const review = await draftEmail(synthesis, collect)
  if (!review) {
    return { status: 'skipped', email, stage: 'draft', reason: 'draft unavailable', enriched: enriched.target, synthesis }
  }

  return { status: 'drafted', email, enriched: enriched.target, synthesis, review }
}

/** Automatic path — resolve the company from the email domain. */
export async function runPipeline(email: string, collect?: LLMUsage[]): Promise<PipelineOutcome> {
  return fromEnriched(email, await enrichTarget(email, {}, collect), collect)
}

/** Manual path — caller supplies the company name (disambiguation recovery). */
export async function runPipelineFromName(email: string, companyName: string, collect?: LLMUsage[]): Promise<PipelineOutcome> {
  return fromEnriched(email, await enrichByName(email, companyName), collect)
}
