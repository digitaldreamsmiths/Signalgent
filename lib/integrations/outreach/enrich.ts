/**
 * Stage 1 enrichment — email → EnrichedTarget.
 *
 * Ties the resolver (which already returns the matched award rows) to call 2
 * (recipient detail for business_types). Footprint comes from aggregating the
 * resolver's rows — no second spending_by_award call needed.
 *
 * Returns a discriminated result so the caller can route resolver/api failures
 * to the skip pile with a reason instead of drafting on nothing.
 */

import { aggregateContractorProfile } from '../usaspending/contractor'
import { fetchRecipientDetail } from '../usaspending/recipient'
import { resolveByName, resolveTarget, type ResolveReason, type ResolvedTarget } from '../usaspending/resolve'
import type { EnrichedTarget } from './types'
import type { FetchOptions } from '../usaspending/base'
import type { LLMUsage } from '../../llm/client'

export type EnrichResult =
  | { ok: true; target: EnrichedTarget }
  | { ok: false; reason: ResolveReason | 'no_detail'; detail?: string }

/** Turn a resolved identity into an EnrichedTarget (footprint + recipient detail). */
async function enrichFromResolved(
  email: string,
  target: ResolvedTarget,
  options: FetchOptions,
): Promise<EnrichResult> {
  const footprint = aggregateContractorProfile(target.recipient_name, target.awards)

  const detail = await fetchRecipientDetail(target.recipient_id, options)
  // Detail is corroboration/personalization; a failure here is non-fatal — we
  // still have the footprint. But business_types is the high-value signal, so
  // surface its absence rather than silently drafting without socioeconomic flags.
  const business_types = detail.ok ? detail.detail!.business_types : []
  const uei = detail.ok ? detail.detail!.uei : null
  const location = detail.ok ? detail.detail!.location.formatted : null

  return {
    ok: true,
    target: {
      email,
      domain: target.domain,
      recipient_name: target.recipient_name,
      recipient_id: target.recipient_id,
      resolution_confidence: target.confidence,
      resolution_method: target.method,
      footprint,
      business_types,
      uei,
      location,
    },
  }
}

export async function enrichTarget(
  email: string,
  options: FetchOptions = {},
  collect?: LLMUsage[],
): Promise<EnrichResult> {
  const resolved = await resolveTarget(email, options, collect)
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason, detail: resolved.detail }
  }
  return enrichFromResolved(email, resolved.target, options)
}

/** Manual disambiguation: enrich from an explicit user-provided company name. */
export async function enrichByName(
  email: string,
  companyName: string,
  options: FetchOptions = {},
): Promise<EnrichResult> {
  const resolved = await resolveByName(email, companyName, options)
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason, detail: resolved.detail }
  }
  return enrichFromResolved(email, resolved.target, options)
}
