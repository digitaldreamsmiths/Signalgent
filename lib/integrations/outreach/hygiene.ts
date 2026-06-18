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
