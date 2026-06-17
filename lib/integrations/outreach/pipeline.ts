/**
 * Outreach pipeline — one email through all four stages.
 *
 *   domain extraction (in resolver) → Stage 1 enrich → Stage 2 synthesize
 *   → confidence gate → Stage 3 draft → drift check
 *
 * Every exit is a typed PipelineOutcome so the review queue (Phase 5) can show
 * drafts vs. the skip pile with reasons. Never throws.
 */

import { enrichTarget } from './enrich'
import { synthesize } from './synthesize'
import { draftEmail } from './draft'
import type { DraftReview, EnrichedTarget, SynthesisResult } from './types'

export type PipelineOutcome =
  | { status: 'drafted'; email: string; enriched: EnrichedTarget; synthesis: SynthesisResult; review: DraftReview }
  | { status: 'skipped'; email: string; stage: 'enrich' | 'synthesis' | 'draft'; reason: string; enriched?: EnrichedTarget; synthesis?: SynthesisResult }

export async function runPipeline(email: string): Promise<PipelineOutcome> {
  const enriched = await enrichTarget(email)
  if (!enriched.ok) {
    return { status: 'skipped', email, stage: 'enrich', reason: `${enriched.reason}${enriched.detail ? `: ${enriched.detail}` : ''}` }
  }

  const synthesis = await synthesize(enriched.target)
  if (synthesis.skip) {
    return { status: 'skipped', email, stage: 'synthesis', reason: synthesis.skip_reason ?? 'skip', enriched: enriched.target, synthesis }
  }

  const review = await draftEmail(synthesis)
  if (!review) {
    return { status: 'skipped', email, stage: 'draft', reason: 'draft unavailable', enriched: enriched.target, synthesis }
  }

  return { status: 'drafted', email, enriched: enriched.target, synthesis, review }
}
