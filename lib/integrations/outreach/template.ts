/**
 * Fallback templates for prospects that can't be personalized (no USASpending
 * match, low-confidence identity, or too thin to synthesize an angle). Instead
 * of dropping them, we attach a sendable generic email.
 *
 * Crucially this is NOT fake personalization: the templates make ZERO
 * company-specific factual claims (empty facts_for_draft is also how the queue
 * tells a template apart from a personalized draft). They only optionally
 * address the company by its resolved name when we have one.
 *
 * This module is the rendering half: placeholder substitution, the deterministic
 * variant pick, and the sign-off. The copy itself lives in ./template-library,
 * which is client-safe so the template editor can offer the same five variants
 * as starters.
 */

import { sanitizeDashes } from './draft'
import { SENDER } from './sender'
import { TEMPLATE_LIBRARY, type TemplateVariant } from './template-library'
import type { DraftResult } from './types'

export { TEMPLATE_LIBRARY, type TemplateVariant }

/** Greeting line ending in a company placeholder, e.g. "Hi {company},". With no
 * resolved name the placeholder must drop out entirely ("Hi,") — the inline
 * fallback reads as a broken mail-merge in the salutation ("Hi your team,"). */
const GREETING_PLACEHOLDER = /\b(hi|hello|hey|dear|greetings)\b[ \t]+\{\{?company\}\}?[ \t]*([,;:!.]?)/gi

/** A placeholder governed by a preposition ("at {company}", "for {company}").
 * Substituting the generic fallback here produces "handled in house at your
 * team" — the prepositional phrase has to drop out whole instead. Only the bare,
 * subject-position placeholder ("Where does {company} keep...") falls back to a
 * generic noun. */
const PREPOSITION_PLACEHOLDER = /[ \t]+\b(at|for|with|to|from|inside|across|within)\b[ \t]+\{\{?company\}\}?/gi

/** Trailing legal entity suffix, dropped so a greeting reads like a person wrote it. */
const TRAILING_LEGAL = /[,\s]+(l\.?l\.?c|inc|incorporated|corp|corporation|co|ltd|limited|l\.?l\.?p|p\.?c|p\.?a)\.?$/i

/**
 * USASpending returns shouted legal names ("OLGOONIK SOLUTIONS LLC"), which read
 * as a mail merge in body copy. Drop the trailing legal suffix and un-shout,
 * preserving short vowel-less tokens (KBTS, SVCS) that are acronyms rather than
 * words. Mixed-case names are already human-written and pass through untouched.
 */
export function prettyCompany(raw: string): string {
  const trimmed = raw.trim().replace(TRAILING_LEGAL, '').trim()
  if (!trimmed) return raw.trim()
  if (trimmed !== trimmed.toUpperCase()) return trimmed
  return trimmed
    .split(/\s+/)
    .map((w) => (w.length <= 4 && !/[aeiouy]/i.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ')
}

/** Render a user-authored template into a sendable draft. Substitutes the
 * `{company}` placeholder with the resolved recipient name, and dash-sanitizes
 * like the personalized path. Makes no factual claims of its own — that's the
 * author's responsibility.
 *
 * With no resolved name the placeholder is removed rather than filled wherever
 * a generic noun would read wrong: in the salutation ("Hi your team,") and after
 * a preposition ("at your team"). Only a bare subject-position placeholder gets
 * the generic fallback.
 *
 * Both `{company}` and `{{company}}` are accepted: authors reasonably assume
 * Handlebars-style double braces, and single-brace-only replacement corrupts
 * them (the inner `{company}` of `{{company}}` matches, leaving a literal
 * `{your team}` in the sent email). */
export function renderTemplate(tmpl: { subject: string; body: string }, recipientName?: string | null): DraftResult {
  const name = recipientName?.trim() ? prettyCompany(recipientName) : null
  const fill = (s: string) => {
    let out = s
    if (!name) {
      // Collapse the salutation and prepositional phrases first, while the
      // placeholders are still intact and matchable.
      out = out.replace(GREETING_PLACEHOLDER, (_m, greeting, punct) => `${greeting}${punct}`)
      out = out.replace(PREPOSITION_PLACEHOLDER, '')
    }
    // Double braces BEFORE single, or the single pass eats the inner braces.
    out = out.replace(/\{\{company\}\}/gi, name ?? 'your team')
    out = out.replace(/\{company\}/gi, name ?? 'your team')
    return sanitizeDashes(out)
  }
  return { subject: fill(tmpl.subject), body: fill(tmpl.body), facts_used: [] }
}

/** Default sign-off for the built-in path. User templates get the company's
 * configured signature appended by `composeEmail` instead; built-ins keep
 * carrying one so the review queue preview reads as a finished email. */
function defaultSignature(): string {
  return `\n\n${SENDER.signOff},\n${SENDER.signatureName}\n${SENDER.product}\n${SENDER.site}`
}

/**
 * FNV-1a. Used only to pick a rotation variant deterministically from a stable
 * key (the prospect id), so the opener and any later follow-up land on the SAME
 * variant without a schema column to remember the choice — built-in drafts store
 * template_id null by definition.
 */
function hashKey(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** The built-in variant this prospect is assigned to. Stable across calls. */
export function variantFor(seed?: string | null): TemplateVariant {
  if (!seed) return TEMPLATE_LIBRARY[0]
  return TEMPLATE_LIBRARY[hashKey(seed) % TEMPLATE_LIBRARY.length]
}

/** Built-in fallback opener, used when a company has authored no active templates. */
export function buildTemplateDraft(recipientName?: string | null, seed?: string | null): DraftResult {
  const v = variantFor(seed)
  const rendered = renderTemplate({ subject: v.subject, body: v.body }, recipientName)
  return { ...rendered, body: sanitizeDashes(rendered.body.trimEnd() + defaultSignature()) }
}

/**
 * Built-in follow-up nudge. Pass the same seed used for the opener so the nudge
 * continues that variant's question instead of opening a new thread of thought.
 */
export function buildTemplateFollowup(recipientName?: string | null, seed?: string | null): DraftResult {
  const v = variantFor(seed)
  const rendered = renderTemplate({ subject: v.followupSubject, body: v.followupBody }, recipientName)
  return { ...rendered, body: sanitizeDashes(rendered.body.trimEnd() + defaultSignature()) }
}
