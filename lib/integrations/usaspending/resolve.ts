/**
 * Domain → company-name resolver. The spec's "genuinely hard piece."
 *
 * Input is an email address. Output is a USASpending identity (canonical
 * recipient name + recipient_id) plus the matched award rows, gated by a
 * confidence score. A bad/low-confidence match routes to the skip pile — we
 * must NOT draft on a wrong entity.
 *
 * Strategy (heuristic-first, AI-assisted — the approach approved for v1):
 *   1. Extract the registrable domain label. Freemail domains → skip (no company).
 *   2. Heuristic candidate: separators (hyphens/dots) → spaces, then query.
 *      VERIFIED LIVE: USASpending's recipient_search_text does NOT match
 *      concatenated strings ("eaglecontractorsinc" → 0 rows) — it needs
 *      space-separated tokens ("eagle contractors" → the company). So for
 *      concatenated labels we ask Haiku to segment the domain into a spaced
 *      company name to query with.
 *   3. Score each distinct returned recipient deterministically: compare the
 *      de-spaced, legal-suffix-stripped recipient name against the domain core.
 *      Exact core match → 1.0 (Eagle hits this; no AI judge needed).
 *   4. Only when the top hit is weak or ambiguous (a near-tie runner-up) does a
 *      Haiku judge adjudicate domain↔recipient fit.
 *   5. Below the confidence floor → skip.
 *
 * Never throws. AI failures degrade to heuristic-only confidence.
 */

import Anthropic from '@anthropic-ai/sdk'
import { fetchWithCircuitBreaker, USASPENDING_BASE, type FetchOptions } from './base'
import { mapAwardRow, type ContractorAward } from './contractor'
import { getAnthropicClient, logUsage } from '../../llm/client'
import { pickModel } from '../../llm/models'

// ── Tunables ────────────────────────────────────────────────────────────────
/** Top heuristic score at/above which we accept without an AI judge. */
const HEURISTIC_ACCEPT = 0.85
/** If the runner-up is within this of the leader, treat as ambiguous → judge. */
const AMBIGUITY_MARGIN = 0.15
/** Final confidence floor. Below this → skip pile. */
const MIN_CONFIDENCE = 0.6

const SPENDING_BY_AWARD_PATH = '/search/spending_by_award/'

/** Personal-email providers — a domain here is not a company. */
const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com',
  'mac.com', 'proton.me', 'protonmail.com', 'gmx.com', 'comcast.net',
  'verizon.net', 'att.net', 'sbcglobal.net',
])

/** Legal-entity suffixes stripped (token-wise) before core comparison. */
const CORP_SUFFIXES = new Set([
  'inc', 'incorporated', 'llc', 'llp', 'lllp', 'ltd', 'limited', 'corp',
  'corporation', 'company', 'co', 'group', 'holdings', 'lp', 'pllc', 'pc',
  'pa', 'the',
])

/** Glued trailing suffixes stripped from a concatenated domain label. */
const GLUED_SUFFIXES = [
  'incorporated', 'corporation', 'company', 'holdings', 'group', 'corp',
  'limited', 'ltd', 'llc', 'llp', 'inc',
]

// ── Public types ──────────────────────────────────────────────────────────────

export interface ResolvedTarget {
  email: string
  domain: string
  /** The search string that produced the match. */
  candidate_name: string
  /** Canonical recipient name from USASpending. */
  recipient_name: string
  recipient_id: string
  /** 0..1. */
  confidence: number
  method: 'heuristic' | 'ai_judge'
  /** Matched award rows for this recipient — hand to aggregateContractorProfile. */
  awards: ContractorAward[]
}

export type ResolveReason =
  | 'freemail'
  | 'no_candidate'
  | 'no_results'
  | 'low_confidence'
  | 'api_error'

export type ResolveResult =
  | { ok: true; target: ResolvedTarget }
  | { ok: false; reason: ResolveReason; domain?: string; detail?: string }

// ── Deterministic helpers ─────────────────────────────────────────────────────

/** Strip everything before/at @, normalize. Stage 0 (deterministic, no AI). */
export function extractDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = email.slice(at + 1).trim().toLowerCase()
  return domain.length > 0 && domain.includes('.') ? domain : null
}

/** Registrable label, e.g. "eaglecontractorsinc.net" → "eaglecontractorsinc". */
function domainLabel(domain: string): string {
  const host = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  const parts = host.split('.').filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2]
  return parts[0] ?? ''
}

function normName(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function coreTokens(name: string): string[] {
  return normName(name).split(' ').filter((t) => t && !CORP_SUFFIXES.has(t))
}

/** Recipient name → de-spaced, suffix-stripped core (e.g. "eaglecontractors"). */
function recipientCore(name: string): string {
  return coreTokens(name).join('')
}

/** Domain label → de-spaced core with a glued legal suffix peeled off. */
function domainCore(label: string): string {
  let core = label.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const suf of GLUED_SUFFIXES) {
    if (core.endsWith(suf) && core.length > suf.length + 2) {
      core = core.slice(0, -suf.length)
      break
    }
  }
  return core
}

/**
 * 0..1 match between a domain label and a candidate recipient name.
 *
 * Only PREFIX alignment earns a high (auto-accept) score — "eaglecontractors"
 * vs "eaglecontractorsinc". A mid-string substring does NOT: "ngconstruction"
 * sits inside "uttingconstruction" but they are different companies, so that
 * case must fall through to the capped token-coverage score and trigger the AI
 * judge rather than silently resolving to the wrong entity.
 */
function matchScore(label: string, recipientName: string): number {
  const dCore = domainCore(label)
  const rCore = recipientCore(recipientName)
  if (!dCore || !rCore) return 0
  if (dCore === rCore) return 1
  if (rCore.startsWith(dCore) || dCore.startsWith(rCore)) {
    const ratio = Math.min(dCore.length, rCore.length) / Math.max(dCore.length, rCore.length)
    return 0.7 + 0.25 * ratio
  }
  // Weak signal: how many distinctive recipient tokens appear in the domain
  // core. Capped at 0.5 so it never auto-accepts — the AI judge adjudicates.
  const toks = coreTokens(recipientName)
  if (toks.length === 0) return 0
  const hit = toks.filter((t) => t.length >= 3 && dCore.includes(t)).length
  return Math.min(0.5, 0.5 * (hit / toks.length))
}

// ── USASpending query (no hard substring filter — resolver scores instead) ────

interface RecipientCandidate {
  recipient_id: string
  recipient_name: string
  awards: ContractorAward[]
  score: number
}

// ── AI assists (Haiku) ────────────────────────────────────────────────────────

async function callHaikuJSON<T>(system: string, user: string, maxTokens: number): Promise<T | null> {
  let client: Anthropic
  try {
    client = getAnthropicClient()
  } catch (err) {
    console.warn('[resolve] no Anthropic client:', err instanceof Error ? err.message : err)
    return null
  }
  const model = pickModel('resolve')
  const startedAt = Date.now()
  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    })
    logUsage({
      task: 'resolve',
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      durationMs: Date.now() - startedAt,
    })
    const block = response.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') return null
    const text = block.text.trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end < 0) return null
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.warn(`[resolve] API error ${err.status}: ${err.message}`)
    } else {
      console.warn('[resolve] error:', err instanceof Error ? err.message : err)
    }
    return null
  }
}

const SEGMENT_SYSTEM =
  'You expand a company web domain into likely registered US company names to ' +
  'search federal contracting records. The domain words are often concatenated ' +
  '(e.g. "eaglecontractorsinc" = "Eagle Contractors Inc"). Output ONLY JSON: ' +
  '{"names":["Name One","Name Two"]} — 1 to 3 candidates, most likely first, ' +
  'space-separated, no commentary.'

async function aiSegmentDomain(domain: string, email: string): Promise<string[]> {
  const out = await callHaikuJSON<{ names?: unknown }>(
    SEGMENT_SYSTEM,
    `Domain: ${domain}\nEmail: ${email}`,
    200,
  )
  const names = Array.isArray(out?.names) ? out!.names : []
  return names.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim())
}

const JUDGE_SYSTEM =
  'You decide which federal contractor (if any) owns a given web domain. Be ' +
  'strict: if none is a clear match, return index -1. Output ONLY JSON: ' +
  '{"index":N,"confidence":0.0-1.0,"reason":"short"} where index is into the ' +
  'provided candidates list (0-based) or -1 for no confident match.'

async function aiJudge(
  domain: string,
  candidates: RecipientCandidate[],
): Promise<{ index: number; confidence: number } | null> {
  const list = candidates
    .map((c, i) => `${i}. ${c.recipient_name} (awards: ${c.awards.length})`)
    .join('\n')
  const out = await callHaikuJSON<{ index?: unknown; confidence?: unknown }>(
    JUDGE_SYSTEM,
    `Domain: ${domain}\nCandidates:\n${list}`,
    200,
  )
  if (!out) return null
  const index = typeof out.index === 'number' ? out.index : -1
  const confidence = typeof out.confidence === 'number' ? out.confidence : 0
  return { index, confidence }
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/** Distinct recipients from raw rows, with recipient_name threaded from rows. */
function distinctRecipients(
  label: string,
  rows: Record<string, unknown>[],
): RecipientCandidate[] {
  const byId = new Map<string, RecipientCandidate>()
  for (const r of rows) {
    const id = String(r['recipient_id'] ?? '')
    if (!id) continue
    const name = String(r['Recipient Name'] ?? '')
    const award = mapAwardRow(r, null)
    const cur = byId.get(id)
    if (cur) {
      cur.awards.push(award)
    } else {
      byId.set(id, { recipient_id: id, recipient_name: name, awards: [award], score: 0 })
    }
  }
  const candidates = [...byId.values()]
  for (const c of candidates) c.score = matchScore(label, c.recipient_name)
  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

/** Raw query returning the JSON rows (resolver needs Recipient Name, dropped by mapAwardRow). */
async function rawQuery(searchText: string, options: FetchOptions): Promise<Record<string, unknown>[] | null> {
  const today = new Date()
  const fiveYearsAgo = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate())
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const payload = {
    filters: {
      recipient_search_text: [searchText],
      award_type_codes: ['A', 'B', 'C', 'D'],
      time_period: [{ start_date: fmt(fiveYearsAgo), end_date: fmt(today) }],
    },
    fields: [
      'Award ID', 'Description', 'Award Amount', 'Awarding Agency Name',
      'Start Date', 'NAICS Code', 'Recipient Name', 'recipient_id',
    ],
    sort: 'Award Amount',
    order: 'desc',
    limit: 100,
    page: 1,
  }
  const result = await fetchWithCircuitBreaker<{ results?: Record<string, unknown>[] }>(
    `${USASPENDING_BASE}${SPENDING_BY_AWARD_PATH}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    },
    options,
  )
  if (result.source === 'failed') return null
  return result.data?.results ?? []
}

/**
 * Resolves an email address to a USASpending identity + footprint rows, gated by
 * confidence. Never throws.
 */
export async function resolveTarget(
  email: string,
  options: FetchOptions = {},
): Promise<ResolveResult> {
  const domain = extractDomain(email)
  if (!domain) return { ok: false, reason: 'no_candidate', detail: 'no domain in email' }
  if (FREEMAIL.has(domain)) return { ok: false, reason: 'freemail', domain }

  const label = domainLabel(domain)
  if (!label) return { ok: false, reason: 'no_candidate', domain }

  // Build the ordered list of search strings to try.
  const searchTerms: string[] = []
  const separated = label.replace(/[-_]+/g, ' ').trim()
  if (separated.includes(' ')) searchTerms.push(separated) // hyphenated domains

  // First attempt with whatever heuristic term we have (if any).
  let rows: Record<string, unknown>[] | null = null
  for (const term of searchTerms) {
    rows = await rawQuery(term, options)
    if (rows === null) return { ok: false, reason: 'api_error', domain }
    if (rows.length > 0) break
  }

  let usedTerm = searchTerms[0] ?? ''

  // Concatenated label or empty heuristic result → ask Haiku to segment, retry.
  if (!rows || rows.length === 0) {
    const aiNames = await aiSegmentDomain(domain, email)
    for (const name of aiNames) {
      rows = await rawQuery(name, options)
      if (rows === null) return { ok: false, reason: 'api_error', domain }
      if (rows.length > 0) {
        usedTerm = name
        break
      }
    }
  }

  if (!rows || rows.length === 0) return { ok: false, reason: 'no_results', domain }

  const candidates = distinctRecipients(label, rows)
  if (candidates.length === 0) return { ok: false, reason: 'no_results', domain }

  const top = candidates[0]
  const runnerUp = candidates[1]
  const ambiguous = runnerUp != null && top.score - runnerUp.score < AMBIGUITY_MARGIN

  let chosen = top
  let confidence = top.score
  let method: ResolvedTarget['method'] = 'heuristic'

  // Heuristic accept only when strong AND unambiguous.
  if (top.score >= HEURISTIC_ACCEPT && !ambiguous) {
    confidence = top.score
  } else {
    // Weak or ambiguous → let Haiku adjudicate among the top few.
    const shortlist = candidates.slice(0, 5)
    const verdict = await aiJudge(domain, shortlist)
    if (verdict && verdict.index >= 0 && verdict.index < shortlist.length) {
      chosen = shortlist[verdict.index]
      // Blend AI confidence with heuristic score (AI weighted) so a high AI
      // confidence on a decent heuristic match clears the floor.
      confidence = 0.65 * verdict.confidence + 0.35 * chosen.score
      method = 'ai_judge'
    } else if (verdict && verdict.index < 0) {
      return { ok: false, reason: 'low_confidence', domain, detail: 'AI judge found no clear match' }
    } else {
      // AI unavailable → fall back to heuristic top, but penalize for ambiguity.
      confidence = top.score * (ambiguous ? 0.7 : 1)
    }
  }

  if (confidence < MIN_CONFIDENCE) {
    return { ok: false, reason: 'low_confidence', domain, detail: `confidence ${confidence.toFixed(2)}` }
  }

  return {
    ok: true,
    target: {
      email,
      domain,
      candidate_name: usedTerm || chosen.recipient_name,
      recipient_name: chosen.recipient_name,
      recipient_id: chosen.recipient_id,
      confidence: Math.round(confidence * 100) / 100,
      method,
      awards: chosen.awards,
    },
  }
}
