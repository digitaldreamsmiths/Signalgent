/**
 * Stage 2 — synthesis. Pick the single best angle, score confidence, gate.
 *
 * Locked contract (from the spec, validated in live testing):
 *  - Output facts_for_draft[]; the draft model may use NOTHING else.
 *  - Find the bridge between ONE procurement signal and ONE proposal pain point.
 *  - Score confidence; low-confidence → skip, never fake personalization.
 *  - Caveat honestly (e.g. low-bid IFBs have no proposal to write → weak fit).
 *
 * The dependable signals (per the Stage 1 caveats) are award amounts
 * (footprint/size), business_types (socioeconomic), and location. Agency/NAICS
 * rollups may be empty — synthesis must not hard-depend on them.
 */

import { callClaudeJSON } from './llm'
import type { EnrichedTarget, SynthesisResult } from './types'

/** One line on what SourceGent is, so synthesis bridges to a real capability. */
const SOURCEGENT_CAPABILITY =
  'SourceGent is a live tool government contractors use to carry the heavy ' +
  'lifting of proposal and capture work (shredding solicitations, drafting ' +
  'compliant responses, organizing past performance) while the firm keeps ' +
  'control of strategy and voice.'

/** Below this fit confidence, route to the skip pile. */
export const SYNTHESIS_CONFIDENCE_FLOOR = 0.6

const SYSTEM = `You are a govcon outreach analyst. Given verified USASpending facts about ONE federal contractor, find the single strongest, most specific bridge between ONE procurement signal about this company and ONE proposal/capture pain point that ${SOURCEGENT_CAPABILITY}

Hard rules:
- Use ONLY the facts provided. Invent nothing. If a field is empty, you do not know it.
- Find exactly ONE angle (one signal -> one pain point). Do not list several.
- Score fit confidence 0.0-1.0 honestly. A thin footprint (few or tiny awards), or a company whose work looks like low-bid IFB construction (price-only, no proposal to write), is a WEAK fit -> low confidence -> skip. Never fabricate a reason to keep someone in.
- facts_for_draft[] are atomic, verifiable statements drawn ONLY from the input (e.g. "Won a $9.59M federal award", "Service-disabled veteran-owned small business", "Based in Indianapolis, IN"). These are the ONLY things the draft writer may use. Keep them tight and true.
- If you skip, set skip=true with a one-line skip_reason and leave facts_for_draft empty.

Output ONLY JSON:
{"skip":false,"skip_reason":null,"confidence":0.0,"angle":"one-sentence bridge","facts_for_draft":["fact","fact"]}`

function renderFacts(t: EnrichedTarget): string {
  const f = t.footprint
  const lines: string[] = []
  lines.push(`Company (verified recipient name): ${t.recipient_name}`)
  lines.push(`Domain: ${t.domain}`)
  if (t.location) lines.push(`Location: ${t.location}`)
  if (t.uei) lines.push(`UEI: ${t.uei}`)
  lines.push(
    `Award footprint (last 5y, sampled top awards): ${f.award_count} awards, ` +
      `sampled total $${f.sampled_total.toLocaleString('en-US')}`,
  )
  if (f.recent_awards.length > 0) {
    lines.push('Notable awards:')
    for (const a of f.recent_awards.slice(0, 5)) {
      const amt = `$${a.award_amount.toLocaleString('en-US')}`
      const agency = a.awarding_agency ? ` from ${a.awarding_agency}` : ''
      const when = a.start_date ? ` (started ${a.start_date})` : ''
      lines.push(`  - ${amt}${agency}${when}: ${a.description}`)
    }
  }
  if (f.top_agencies.length > 0) {
    lines.push(`Top agencies: ${f.top_agencies.map((x) => `${x.agency} ($${x.amount.toLocaleString('en-US')})`).join(', ')}`)
  }
  if (t.business_types.length > 0) {
    lines.push(`Socioeconomic flags (business_types): ${t.business_types.join(', ')}`)
  } else {
    lines.push('Socioeconomic flags: none returned')
  }
  return lines.join('\n')
}

export async function synthesize(target: EnrichedTarget): Promise<SynthesisResult> {
  const out = await callClaudeJSON<Partial<SynthesisResult>>('synthesis', SYSTEM, renderFacts(target), 1200)

  // Null (LLM/API failure) or malformed → safe skip.
  if (!out) {
    return { skip: true, skip_reason: 'synthesis unavailable', confidence: 0, angle: null, facts_for_draft: [] }
  }

  const facts = Array.isArray(out.facts_for_draft)
    ? out.facts_for_draft.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : []
  const confidence = typeof out.confidence === 'number' ? out.confidence : 0

  // Honor an explicit skip, OR enforce the floor / require facts ourselves.
  if (out.skip === true || confidence < SYNTHESIS_CONFIDENCE_FLOOR || facts.length === 0) {
    return {
      skip: true,
      skip_reason: out.skip_reason || (facts.length === 0 ? 'no usable facts' : `confidence ${confidence.toFixed(2)} below floor`),
      confidence,
      angle: out.angle ?? null,
      facts_for_draft: [],
    }
  }

  return {
    skip: false,
    skip_reason: null,
    confidence,
    angle: out.angle ?? null,
    facts_for_draft: facts,
  }
}
