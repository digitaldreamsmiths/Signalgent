/**
 * Deterministic spam-hygiene linter for a draft. Surfaces soft warnings only
 * (never blocks) so the reviewer can decide. Tuned for high precision in a
 * govcon cold-email context — phrases are word-bounded and the noisy "free"
 * family is deliberately omitted to avoid flagging legitimate copy.
 */

const SPAM_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bact now\b/i, label: 'act now' },
  { re: /\bact immediately\b/i, label: 'act immediately' },
  { re: /\blimited time\b/i, label: 'limited time' },
  { re: /\boffer expires\b/i, label: 'offer expires' },
  { re: /\brisk[- ]free\b/i, label: 'risk-free' },
  { re: /\bno obligation\b/i, label: 'no obligation' },
  { re: /\bclick here\b/i, label: 'click here' },
  { re: /\bbuy now\b/i, label: 'buy now' },
  { re: /\border now\b/i, label: 'order now' },
  { re: /\bguarantee(d|s)?\b/i, label: 'guarantee' },
  { re: /\b100%\b/, label: '100%' },
  { re: /\bcongratulations\b/i, label: 'congratulations' },
  { re: /\bwinner\b/i, label: 'winner' },
  { re: /\bcheap\b/i, label: 'cheap' },
]

/** Returns human-readable hygiene warnings; empty array means the draft is clean. */
export function hygieneWarnings(subject: string, body: string): string[] {
  const warnings: string[] = []
  const text = `${subject}\n${body}`

  const links = (text.match(/https?:\/\/|www\./gi) ?? []).length
  if (links > 2) warnings.push(`${links} links (aim for 1–2)`)

  const phrases = SPAM_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label)
  if (phrases.length) warnings.push(`spam-flag phrases: ${phrases.slice(0, 4).join(', ')}`)

  const bangs = (text.match(/!/g) ?? []).length
  if (bangs > 2 || /[!?]{2,}/.test(text)) warnings.push('excessive punctuation')

  // A shouty subject is a strong spam signal and rarely legitimate.
  const subjLetters = subject.replace(/[^a-z]/gi, '')
  if (subjLetters.length >= 6 && subject === subject.toUpperCase()) warnings.push('all-caps subject')

  const words = body.trim().split(/\s+/).filter(Boolean).length
  if (words > 220) warnings.push(`long body (${words} words)`)

  return warnings
}

// ── Reply risk ────────────────────────────────────────────────────────────────
//
// Deliverability (above) is about landing in the inbox; this is about being
// answered once it does. The checks encode what a 344-send, zero-reply run
// showed was wrong with the original copy, and they mirror the rules in the
// Stage 3 draft prompt so user-authored templates are held to the same bar.
//
// Deliberately dependency-free: this module is imported by client components,
// so it must not pull in the draft module (and with it the Anthropic SDK).

/** Generic sign-off line, so length and ending checks ignore the signature. */
const SIGN_OFF = /\n[ \t]*(best|best regards|regards|thanks|thank you|sincerely|cheers|warmly)[,.]?[ \t]*\n/i

/** Closing pleasantries that hand the reader an exit instead of an ask. */
const RELEASE_PHRASES: { re: RegExp; label: string }[] = [
  { re: /\beither way\b/i, label: 'either way' },
  { re: /\bno worries\b/i, label: 'no worries' },
  { re: /\bwishing you\b/i, label: 'wishing you' },
  { re: /\bgood luck (with|on|in)\b/i, label: 'good luck with' },
  { re: /\bbest of luck\b/i, label: 'best of luck' },
  { re: /\bthanks for your time\b/i, label: 'thanks for your time' },
  { re: /\bno pressure\b/i, label: 'no pressure' },
]

/** Abstract benefit language that gives the reader nothing to picture. */
const VAGUE_PHRASES: { re: RegExp; label: string }[] = [
  { re: /\b(lighter|proposal) load\b/i, label: 'proposal load' },
  { re: /\bbusywork\b/i, label: 'busywork' },
  { re: /\bheavy lifting\b/i, label: 'heavy lifting' },
  { re: /\bstreamline\b/i, label: 'streamline' },
  { re: /\bleverage\b/i, label: 'leverage' },
  { re: /\bseamless\b/i, label: 'seamless' },
  { re: /\bgame.changer\b/i, label: 'game changer' },
  { re: /\bempower\b/i, label: 'empower' },
]

/** Concrete nouns that give the pitch something to picture. At least one wanted. */
const CONCRETE = /\b(compliance matrix|shred|solicitation|past performance|first draft|section [lm]\b|pink team|recompete|proposal)/i

/** The email body with any signature block removed. */
function beforeSignature(body: string): string {
  const m = body.match(SIGN_OFF)
  return (m?.index !== undefined ? body.slice(0, m.index) : body).trim()
}

export interface ReplyRiskOptions {
  /** Template editing: also require a {company} placeholder for personalization. */
  isTemplate?: boolean
}

/**
 * Warnings about whether this email will get a REPLY. Ordered most to least
 * costly. Soft warnings only, never blocking — the author decides.
 */
export function replyRiskWarnings(subject: string, body: string, opts: ReplyRiskOptions = {}): string[] {
  const warnings: string[] = []
  const main = beforeSignature(body)

  if (!main.endsWith('?')) {
    warnings.push('doesn’t end on a question — nothing for them to answer')
  }

  const release = RELEASE_PHRASES.filter((p) => p.re.test(main)).map((p) => p.label)
  if (release.length) {
    warnings.push(`lets them off the hook: “${release.slice(0, 2).join('”, “')}”`)
  }

  const words = main.split(/\s+/).filter(Boolean).length
  if (words > 90) warnings.push(`${words} words — aim under 90`)

  const vague = VAGUE_PHRASES.filter((p) => p.re.test(`${subject}\n${main}`)).map((p) => p.label)
  if (vague.length) warnings.push(`vague benefit language: ${vague.slice(0, 3).join(', ')}`)

  // Only openers have to name the artifact. A follow-up nudge is meant to be
  // bare, and demanding the pitch again is how nudges turn back into pitches.
  if (words >= 55 && !CONCRETE.test(main)) warnings.push('nothing concrete to picture — name the actual artifact')

  const subjWords = subject.trim().split(/\s+/).filter(Boolean).length
  if (subjWords > 6) warnings.push(`subject is ${subjWords} words — 2 to 5 reads like a colleague`)
  if (/\{\{?company\}\}?/i.test(subject)) warnings.push('company name in the subject is a mail-merge tell')

  if (opts.isTemplate && !/\{\{?company\}\}?/i.test(body)) {
    warnings.push('no {company} placeholder — every recipient gets identical copy')
  }

  return warnings
}
