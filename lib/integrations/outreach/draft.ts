/**
 * Stage 3 — draft. Write the email using ONLY facts_for_draft.
 *
 * The draft echoes facts_used so a deterministic drift check can auto-reject any
 * draft that leaned on a fact outside the approved set — one hallucinated award
 * kills the email with a capture lead who knows their own history.
 *
 * The register was rewritten after a 344-send run returned zero replies. What
 * changed and why:
 *   - The body now ENDS on a closed question. The old register closed on a good
 *     wish ("either way, wishing you a strong run"), which is a polite permission
 *     slip to ignore the email. Nothing may follow the question.
 *   - A 90-word ceiling, down from an unbounded body.
 *   - The pitch must name a concrete artifact (compliance matrix, shred, Section
 *     L) instead of abstract benefit language ("a lighter proposal load").
 *   - The subject is constrained for the first time. It was previously
 *     unspecified, so 344 emails went out with inconsistent, unattributable
 *     subjects, most of them benefit claims that read as marketing.
 *
 * Two layers enforce this. Deletion-based cleanup (dashes, bracketed
 * placeholders, release valves) runs unconditionally, because the model leaks
 * those no matter what the prompt says. Shape failures that deletion cannot fix
 * (no closing question, over the word ceiling) trigger exactly one re-ask.
 */

import { callClaudeJSON } from './llm'
import { SENDER } from './sender'
import { DEFAULT_OFFER_PROFILE, userCountMid, type OfferProfile } from './offer-profile'
import type { DraftResult, DraftReview, SynthesisResult } from './types'
import type { LLMUsage } from '../../llm/client'

// Sender identity + social proof live in ./sender so client components can read
// them without pulling this module (and the Anthropic SDK) into the browser
// bundle. Re-exported here because existing callers import SENDER from './draft'.
export { SENDER }

/** The register, rendered against a tenant's offer profile. With the SourceGent
 * defaults this matches the original hardcoded prompt, plus an explicit "what
 * it does" sentence (previously implied by the artifact list alone). */
function systemFor(p: OfferProfile): string {
  return `You write a single cold outreach email to ${p.audience}. The email exists to get a REPLY, not to explain a product. You may use ONLY the facts provided in facts_for_draft. Use nothing else about the company.

Shape (follow exactly, in this order):
1. Greet with exactly "Hi," on its own line. You do NOT know the recipient's name, so NEVER write a placeholder like "[Name]", "[First Name]", or "[Company]" anywhere. No square brackets at all.
2. ONE sentence that earns the email from the facts. Specific, no flattery, no "I came across your company". Never congratulate.
3. ONE or TWO sentences naming ${p.product} exactly once, as a live tool in active use. NEVER "building", "launching", "working on", or anything pre-launch. What it does: ${p.pitch} Include at least one CONCRETE artifact of the work from this list: ${p.artifacts.join(', ')}. Social proof in passing, at most once, phrased as "${userCountMid(p)} use it" and optionally "${p.pipeline}". Never a boast.
4. The LAST line of the body is a QUESTION ending in "?". One question, closed, answerable in a single line by someone who has never heard of you (e.g. "Is drafting the slow part, or is past performance worse?"). The body ends there.

Hard rules:
- The body is at most 90 words. Shorter is better. Every sentence must earn its place.
- NOTHING follows the question. Absolutely no closing pleasantry after it: no "either way", "no worries either way", "wishing you", "good luck with", "best of luck", "thanks for your time". These release the reader from replying and they are the single biggest reason a cold email gets ignored.
- No vague benefit language. BANNED words and phrases: "lighter load", "proposal load", "busywork", "heavy lifting", "streamline", "solution", "leverage", "game changer", "revolutionize", "empower", "seamless", "cutting edge".
- No free-labor offers. No "problem -> solution -> demo" skeleton. No generic "15 minutes" or "quick call" ask.
- No spam-filter bait anywhere in subject or body: no "congratulations", "guarantee", "winner", "act now", "limited time", "risk-free", "100%", "cheap".
- The site link (${p.site}) lives in the signature only. The body never sells hard.
- No dashes used as punctuation anywhere: no em dashes, no en dashes, no double hyphens (--), no spaced hyphens ( - ). Use commas or separate sentences instead. Normal hyphenated words (service-disabled) are fine.
- Sign off as "${p.sign_off},\\n${p.signature_name}\\n${p.product}\\n${p.site}". The signature is not part of the 90 words.

Subject line rules:
- 2 to 5 words. Lowercase except proper nouns. It should read like a colleague's subject, not marketing.
- It is a topic or a question, NEVER a benefit claim. Good: "recompete question", "who writes your proposals?", "past performance". Bad: "A lighter proposal load for Acme", "Helping Acme win more".
- Do NOT put the company name in the subject. It is the clearest mail-merge tell there is.

Output ONLY JSON:
{"subject":"...","body":"...","facts_used":["the exact facts_for_draft strings you used"]}
facts_used MUST be copied verbatim from facts_for_draft. Do not paraphrase them there.`
}

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
      'Write a SHORTER nudge than the opener: at most 60 words, lead with a different fact than the first email would have, and add one fresh angle.',
      touch.priorSubject
        ? `Reuse the EXACT prior subject "${touch.priorSubject}" so it reads as the same thread. Do not add "Following up:" or "Re:".`
        : 'Keep the subject to the same 2 to 5 word topic form as an opener.',
      'Do NOT guilt-trip or say "just following up" / "bumping this" / "circling back". No new facts beyond facts_for_draft.',
      'It still ends on ONE closed question ending in "?", with nothing after it. The same ban on closing pleasantries applies.',
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

/**
 * Closing pleasantries that hand the reader an exit ("either way, wishing you a
 * strong run"). The register bans them and the model writes them anyway, because
 * they are what polite email looks like in its training data. Like the dash rule,
 * fix deterministically rather than only flag: an email whose last line is a
 * good wish instead of a question is an email nobody answers.
 */
const RELEASE_PHRASES =
  /\b(either way|no worries|wishing you|good luck (?:with|on|in)|best of luck|thanks for your time|no pressure|hope (?:this|that) helps|feel free to ignore)\b/i

/** Index of the sign-off block, so cleanup never chews into the signature. */
function signatureIndex(body: string, signOff: string = DEFAULT_OFFER_PROFILE.sign_off): number {
  const escaped = signOff.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = body.match(new RegExp(`\\n[ \\t]*${escaped},[ \\t]*\\n`))
  return m?.index ?? -1
}

/** Splits into sentence-ish chunks, keeping each chunk's trailing punctuation. */
function sentences(line: string): string[] {
  return line.match(/[^.?!]+[.?!]*/g) ?? []
}

/** Drops the sentences that release the reader, leaving the body ending on its ask. */
export function stripReleaseValves(body: string, signOff?: string): string {
  const idx = signatureIndex(body, signOff)
  const head = idx >= 0 ? body.slice(0, idx) : body
  const tail = idx >= 0 ? body.slice(idx) : ''

  const cleanedHead = head
    .split('\n')
    .map((line) => {
      if (!RELEASE_PHRASES.test(line)) return line
      return sentences(line)
        .filter((s) => !RELEASE_PHRASES.test(s))
        .join('')
        .trim()
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // collapse the gap a removed paragraph leaves
    .trimEnd()

  // trimEnd() above eats the blank line that separated the body from the
  // sign-off; tail begins with the newline that opened the match, so one more
  // restores it. Without this the signature butts against the last sentence.
  return tail ? `${cleanedHead}\n${tail}` : cleanedHead
}

/** Body length excluding the signature block — what the 90-word ceiling governs. */
export function bodyWordCount(body: string, signOff?: string): number {
  const idx = signatureIndex(body, signOff)
  const head = idx >= 0 ? body.slice(0, idx) : body
  return head.trim().split(/\s+/).filter(Boolean).length
}

/** Whether the body's last line before the signature is a question. */
export function endsOnQuestion(body: string, signOff?: string): boolean {
  const idx = signatureIndex(body, signOff)
  const head = (idx >= 0 ? body.slice(0, idx) : body).trimEnd()
  return head.endsWith('?')
}

/** Drift check + dash/placeholder/release-valve sanitize. Body is cleaned; drift on facts_used is reported. */
export function reviewDraft(draft: DraftResult, factsForDraft: string[], signOff?: string): DraftReview {
  const cleaned: DraftResult = {
    ...draft,
    subject: stripPlaceholders(sanitizeDashes(draft.subject)),
    body: stripReleaseValves(stripPlaceholders(sanitizeDashes(draft.body)), signOff),
  }
  const known = new Set(factsForDraft.map((f) => f.trim().toLowerCase()))
  const drifted = cleaned.facts_used.filter((f) => !known.has(f.trim().toLowerCase()))
  return {
    draft: cleaned,
    drifted_facts: drifted,
    clean: drifted.length === 0,
  }
}

/** Word ceiling for an opener body; follow-ups get the tighter number. */
const WORD_CEILING = 90
const FOLLOWUP_WORD_CEILING = 60

/**
 * The two shape rules worth failing a draft over. Unlike dashes and release
 * valves, neither can be fixed by deletion: a body with no question needs new
 * prose, and an over-long body needs to be rewritten rather than truncated. So
 * we re-ask once with the specific complaint.
 */
function shapeComplaints(body: string, ceiling: number, signOff: string): string[] {
  const out: string[] = []
  if (!endsOnQuestion(body, signOff)) {
    out.push('The body did not END on a question. Rewrite so the final line before the signature is one closed question ending in "?", with nothing after it.')
  }
  const words = bodyWordCount(body, signOff)
  if (words > ceiling) {
    out.push(`The body was ${words} words, over the ${ceiling}-word ceiling. Cut it down, do not just trim the ending.`)
  }
  return out
}

async function callDraft(
  synthesis: SynthesisResult,
  collect: LLMUsage[] | undefined,
  touch: TouchContext | undefined,
  profile: OfferProfile,
  extra?: string,
): Promise<DraftResult | null> {
  const input = renderInput(synthesis.angle, synthesis.facts_for_draft, touch)
  const out = await callClaudeJSON<Partial<DraftResult>>(
    'draft',
    systemFor(profile),
    extra ? `${input}\n\nYour previous attempt was rejected:\n${extra}\nEverything else about it was fine. Rewrite the whole email.` : input,
    1500,
    collect,
  )
  if (!out || typeof out.subject !== 'string' || typeof out.body !== 'string') return null
  return {
    subject: out.subject.trim(),
    body: out.body.trim(),
    facts_used: Array.isArray(out.facts_used)
      ? out.facts_used.filter((x): x is string => typeof x === 'string')
      : [],
  }
}

export async function draftEmail(
  synthesis: SynthesisResult,
  collect?: LLMUsage[],
  touch?: TouchContext,
  profile: OfferProfile = DEFAULT_OFFER_PROFILE,
): Promise<DraftReview | null> {
  if (synthesis.skip || synthesis.facts_for_draft.length === 0) return null

  const ceiling = touch && touch.step > 1 ? FOLLOWUP_WORD_CEILING : WORD_CEILING

  const first = await callDraft(synthesis, collect, touch, profile)
  if (!first) return null
  const firstReview = reviewDraft(first, synthesis.facts_for_draft, profile.sign_off)

  // Deletion-based cleanup runs before the shape check, so a draft whose only
  // sin was a trailing good-wish already passes without burning a second call.
  const complaints = shapeComplaints(firstReview.draft.body, ceiling, profile.sign_off)
  if (complaints.length === 0) return firstReview

  const retry = await callDraft(synthesis, collect, touch, profile, complaints.map((c) => `- ${c}`).join('\n'))
  if (!retry) return firstReview // one bad shape beats no email at all; the queue is reviewed anyway
  const retryReview = reviewDraft(retry, synthesis.facts_for_draft, profile.sign_off)
  return shapeComplaints(retryReview.draft.body, ceiling, profile.sign_off).length === 0 ? retryReview : firstReview
}
