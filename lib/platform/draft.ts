/**
 * Prompt construction and output cleanup for Social studio drafting.
 *
 * Pure functions, no I/O: the server action in draft-actions.ts gathers the
 * company facts, calls the model, and hands the JSON here to normalize.
 * Keeping the prompt here lets the register be reviewed and tested without a
 * database or an API key.
 */

import { CHANNELS, type Channel } from './types'

export interface DraftContext {
  companyName: string
  description: string
  industry: string
  website: string
  /** From the offer profile. Any field may be empty for a tenant without one. */
  product: string
  pitch: string
  audience: string
  /** Campaign objective, when the post belongs to a campaign. */
  objective: string
}

export interface DraftRequest {
  title: string
  /** Whatever the user has typed so far: notes, a rough draft, or nothing. */
  brief: string
  channels: Channel[]
}

export interface DraftOutput {
  title: string
  posts: Partial<Record<Channel, string>>
}

function fact(label: string, value: string): string {
  return value.trim() ? `${label}: ${value.trim()}` : ''
}

export function systemPrompt(ctx: DraftContext): string {
  const facts = [
    fact('Business', ctx.companyName),
    fact('What it does', ctx.description),
    fact('Industry', ctx.industry),
    fact('Website', ctx.website),
    fact('Product', ctx.product),
    fact('Pitch', ctx.pitch),
    fact('Audience', ctx.audience),
  ].filter(Boolean).join('\n')
  return `You write social media and newsletter copy for one small business. You write in that business's own voice, as a person from the business, never as an agency and never about "we at [company]" in the third person.

Facts you may use:
${facts || 'Business: (no details on file)'}

Rules:
1. Use only the facts above and what the request says. Invent nothing: no customer names, no numbers, no awards, no dates, no quotes, no results. If you lack a detail, write around it.
2. No placeholders. Never output square brackets or anything the reader has to fill in.
3. No em dashes, en dashes, or hyphens used as dashes. Use a comma, a period, or a new sentence.
4. No emoji unless the request asks for them.
5. Plain, specific language. Cut "excited to announce", "game-changing", "unlock", "elevate", "seamless", "leverage", and similar filler.
6. Each channel gets its own version written for that channel, not one text copied with the hashtags changed. Respect every character limit as a hard cap.
7. Return only JSON, shaped exactly like: {"title": "short working title", "posts": {"<channel>": "post text", ...}}. Line breaks inside a post are "\\n". Include exactly the channels requested and no others.`
}

export function userPrompt(req: DraftRequest, objective: string): string {
  const specs = req.channels.map(c => `- ${c} (${CHANNELS[c].label}): ${CHANNELS[c].style} Aim for ${CHANNELS[c].ideal}. Hard cap ${CHANNELS[c].limit.toLocaleString()} characters.`).join('\n')
  const lines = [
    req.title.trim() ? `Working title: ${req.title.trim()}` : '',
    objective.trim() ? `Campaign objective: ${objective.trim()}` : '',
    req.brief.trim() ? `Notes or rough draft from the author (treat as the brief; keep any specific facts in it, rewrite the prose):\n${req.brief.trim()}` : 'The author has not written anything yet. Draft from the title and the business facts.',
    '',
    'Channels to write for:',
    specs,
    '',
    `Return JSON with "title" and "posts" containing keys: ${req.channels.join(', ')}.`,
  ]
  return lines.filter((l, i) => l !== '' || i > 0).join('\n')
}

/** Same dash policy as outreach drafting: fix, never flag. */
export function cleanProse(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s*-{2,}\s*/g, ', ')
    .replace(/ +- +/g, ', ')
    .replace(/,\s*,/g, ', ')
    .replace(/[ \t]+,/g, ',')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Validate the model's JSON against the request. Returns null when unusable. */
export function normalizeOutput(raw: unknown, req: DraftRequest): DraftOutput | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { title?: unknown; posts?: unknown }
  const posts = obj.posts && typeof obj.posts === 'object' ? (obj.posts as Record<string, unknown>) : null
  if (!posts) return null
  const out: Partial<Record<Channel, string>> = {}
  for (const channel of req.channels) {
    const value = posts[channel]
    if (typeof value !== 'string') continue
    const clean = cleanProse(value).replace(/\[[^\]]{0,60}\]/g, '').trim()
    if (clean) out[channel] = clean
  }
  if (!Object.keys(out).length) return null
  const title = typeof obj.title === 'string' ? cleanProse(obj.title).replace(/^["']|["']$/g, '').slice(0, 180) : ''
  return { title, posts: out }
}
