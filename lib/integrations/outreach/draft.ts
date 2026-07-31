/**
 * Stage 3 — draft. Write the email using ONLY facts_for_draft.
 *
 * The register below is final and tested (locked in the spec). The draft echoes
 * facts_used so a deterministic drift check can auto-reject any draft that
 * leaned on a fact outside the approved set — one hallucinated award kills the
 * email with a capture lead who knows their own history.
 */

import { callClaudeJSON } from './llm'
import type { DraftResult, DraftReview, SynthesisResult } from './types'
import type { LLMUsage } from '../../llm/client'

/**
 * Sender identity for the signature. Site is confirmed (sourcegent.io); the
 * sign-off name is a placeholder to confirm — it does not affect body quality,
 * which is what the Stage 3 gate judges.
 */
export const SENDER = {
  product: 'SourceGent',
  site: 'sourcegent.io',
  signOff: 'Best',
  signatureName: 'Eudon Delemar', // sender; change here if outreach is sent under another name
}

const SYSTEM = `You write a single cold outreach email to a government contractor. Register: genuine interest in the company plus a light sell of the idea. You may use ONLY the facts provided in facts_for_draft. Use nothing else about the company.

Rules (follow exactly):
- Greet with exactly "Hi," on its own line. You do NOT know the recipient's name, so NEVER write a placeholder like "[Name]", "[First Name]", or "[Company]" anywhere. No square brackets at all.
- Open with ONE specific, earned observation about this company drawn from the facts. No flattery.
- Name ${SENDER.product} exactly once, framed as a live tool in active use ("the contractors using it", "how other firms use it"). NEVER "building", "launching", "working on", or anything pre-launch. The user base is social proof in passing, never a boast.
- One sentence on the core idea, one short line on the promise (they keep control, the load drops). Stop there.
- No free-labor offers. No "problem -> solution -> demo" skeleton.
- CTA soft and conditioned on their interest ("if X is on your mind..."). No generic "15 minutes".
- Close warm and non-transactional. Good wishes either way, but NEVER with spam-filter bait: no "congratulations", "guarantee", "winner", "act now", "limited time", "risk-free", "100%", or "cheap" anywhere in the subject or body. Prefer "well done on X" or "good luck with X".
- The site link (${SENDER.site}) lives in the signature only. The body never sells hard.
- No dashes used as punctuation anywhere: no em dashes, no en dashes, no double hyphens (--), no spaced hyphens ( - ). Use commas or separate sentences instead. Normal hyphenated words (service-disabled) are fine.
- Sign off as "${SENDER.signOff},\\n${SENDER.signatureName}\\n${SENDER.site}".

Output ONLY JSON:
{"subject":"...","body":"...","facts_used":["the exact facts_for_draft strings you used"]}
facts_used MUST be copied verbatim from facts_for_draft. Do not paraphrase them there.`

/** Optional follow-up context. step > 1 means this is a nudge, not the opener. */
export interface TouchContext {
  step: number
  priorSubject?: string
}

function renderInput(angle: string | null, facts: string[], touch?: TouchContext): string {
  const lines = ['facts_for_draft (use ONLY these):']
  for (const f of facts) lines.push(`- ${f}`)
  if (angle) lines.push(`\nAngle to lead with: ${angle}`)
  if (touch && touch.step > 1) {
    lines.push(
      `\nThis is FOLLOW-UP #${touch.step}. The prior email${touch.priorSubject ? ` (subject: "${touch.priorSubject}")` : ''} got no reply.`,
      'Write a SHORTER nudge than the opener: lead with a different fact than the first email would have, add one fresh angle, and keep it to a few sentences.',
      'Do NOT guilt-trip or say "just following up" / "bumping this" / "circling back". No new facts beyond facts_for_draft. One-line soft CTA. Same register and signature.',
    )
  }
  return lines.join('\n')
}

/**
 * Deterministically removes dash punctuation the register forbids. The draft
 * model leaks dashes despite the prompt rule, and substitutes ASCII "--" / " - "
 * when told not to use em dashes, so we catch all of them and fix rather than
 * only flag. Single in-word hyphens (service-disabled, veteran-owned) are left
 * intact — only spaced or doubled hyphens used AS a dash are collapsed to ", ".
 */
export function sanitizeDashes(text: string): string {
  return text
    .replace(/\s*[—–]\s*/g, ', ') // em / en dash
    .replace(/\s*-{2,}\s*/g, ', ') // doubled (or more) hyphen used as a dash
    .replace(/ +- +/g, ', ') // spaced single hyphen used as a dash
    .replace(/,\s*,/g, ', ') // collapse doubled commas
    .replace(/\s+,/g, ',') // no space before a comma
}

/**
 * Removes mail-merge placeholders the model invents. We only ever know the
 * prospect's email address, never a contact name, so a bracketed token is always
 * an unfilled template artifact — "Hi [Name]," reaching a real capture lead
 * reads as an automated blast. Like the dash rule, the prompt forbids these and
 * the model still leaks them, so fix deterministically rather than only flag.
 */
export function stripPlaceholders(text: string): string {
  return text
    // "Hi [Name]," -> "Hi," (keep the greeting, drop the placeholder)
    .replace(/\b(hi|hello|hey|dear|greetings)\b[ \t]+\[[^\]\n]{1,40}\][ \t]*([,;:!.]?)/gi, (_m, greeting, punct) => `${greeting}${punct}`)
    // any other bracketed token, plus the space that preceded it
    .replace(/[ \t]*\[[^\]\n]{1,40}\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
}

/** Drift check + dash/placeholder sanitize. Body is cleaned; drift on facts_used is reported. */
export function reviewDraft(draft: DraftResult, factsForDraft: string[]): DraftReview {
  const cleaned: DraftResult = {
    ...draft,
    subject: stripPlaceholders(sanitizeDashes(draft.subject)),
    body: stripPlaceholders(sanitizeDashes(draft.body)),
  }
  const known = new Set(factsForDraft.map((f) => f.trim().toLowerCase()))
  const drifted = cleaned.facts_used.filter((f) => !known.has(f.trim().toLowerCase()))
  return {
    draft: cleaned,
    drifted_facts: drifted,
    clean: drifted.length === 0,
  }
}

export async function draftEmail(synthesis: SynthesisResult, collect?: LLMUsage[], touch?: TouchContext): Promise<DraftReview | null> {
  if (synthesis.skip || synthesis.facts_for_draft.length === 0) return null

  const out = await callClaudeJSON<Partial<DraftResult>>(
    'draft',
    SYSTEM,
    renderInput(synthesis.angle, synthesis.facts_for_draft, touch),
    1500,
    collect,
  )
  if (!out || typeof out.subject !== 'string' || typeof out.body !== 'string') return null

  const draft: DraftResult = {
    subject: out.subject.trim(),
    body: out.body.trim(),
    facts_used: Array.isArray(out.facts_used)
      ? out.facts_used.filter((x): x is string => typeof x === 'string')
      : [],
  }
  return reviewDraft(draft, synthesis.facts_for_draft)
}
