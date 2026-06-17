/**
 * USASpending call 1 — recipient-name → award footprint.
 *
 * Ported from SourceGent's src/lib/rfp/contractor-xray.ts (see
 * docs/specs/sourcegent-reference/contractor-xray.ts). Two changes per the spec
 * appendix, everything else verbatim:
 *
 *   1. `recipient_id` added to the requested `fields` AND surfaced on each row /
 *      the profile — it is the value passed to call 2 (recipient detail).
 *   2. `fetchWithRetry` (raw Response, throws) swapped for
 *      `fetchWithCircuitBreaker` (parsed FetchResult, never throws). Only the
 *      two lines that touched the Response change; the recipient substring
 *      filter, mapAwardRow, and aggregateContractorProfile are untouched —
 *      they're the valuable deterministic core.
 *
 * Deterministic only — no AI, no DB. The footprint is framed across the
 * contractor's LARGEST recent awards (a bounded spending_by_award page), not a
 * lifetime obligation total.
 *
 * Reliability caveat (verified live, Eagle Contractors): `Awarding Agency Name`
 * and `NAICS Code` can come back null on the award rows, so the agency/NAICS
 * rollups may be thin or empty per company. Dependable signals: award amounts
 * (footprint/size) + recipient_id (feeds call 2) + recipient name.
 */

import { fetchWithCircuitBreaker, USASPENDING_BASE, type FetchOptions } from './base'

const SPENDING_BY_AWARD_PATH = '/search/spending_by_award/'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const xrayCache = new Map<string, { data: ContractorProfile; timestamp: number }>()

function getCached(key: string): ContractorProfile | null {
  const entry = xrayCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    xrayCache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: ContractorProfile) {
  if (xrayCache.size > 200) {
    const oldest = xrayCache.keys().next().value
    if (oldest) xrayCache.delete(oldest)
  }
  xrayCache.set(key, { data, timestamp: Date.now() })
}

export interface ContractorAward {
  award_id: string
  description: string
  award_amount: number
  awarding_agency: string
  start_date: string | null
  naics_code: string
  /** Top-level recipient_id from the result row (e.g. "b353...-C"). Feeds call 2. */
  recipient_id: string
}

export interface AgencyRollup {
  agency: string
  amount: number
  count: number
}

export interface NaicsRollup {
  naics: string
  amount: number
  count: number
}

export interface ContractorProfile {
  recipient_name: string
  /**
   * The recipient_id shared by the matched awards (most common value). Pass to
   * the recipient-detail endpoint for business_types. Null if no row carried one.
   */
  recipient_id: string | null
  /** Number of awards in the sampled page. */
  award_count: number
  /** Sum of award amounts across the sampled awards. */
  sampled_total: number
  top_agencies: AgencyRollup[]
  naics_spread: NaicsRollup[]
  recent_awards: ContractorAward[]
}

export interface ContractorXrayResult {
  ok: boolean
  profile: ContractorProfile | null
  reason?: 'no_recipient' | 'no_results' | 'api_error'
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Picks the most common non-empty recipient_id across matched awards. */
function dominantRecipientId(awards: ContractorAward[]): string | null {
  const counts = new Map<string, number>()
  for (const a of awards) {
    if (a.recipient_id) counts.set(a.recipient_id, (counts.get(a.recipient_id) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id
      bestCount = count
    }
  }
  return best
}

/**
 * Pure aggregation of raw contractor awards into a footprint profile. Separated
 * from the fetch so it is unit-testable. Agencies + NAICS are rolled up by
 * amount (desc); recent_awards are the most recent by start_date (desc).
 */
export function aggregateContractorProfile(
  recipientName: string,
  awards: ContractorAward[],
  opts: { topN?: number; recentN?: number } = {},
): ContractorProfile {
  const topN = opts.topN ?? 5
  const recentN = opts.recentN ?? 5

  const agencyMap = new Map<string, AgencyRollup>()
  const naicsMap = new Map<string, NaicsRollup>()
  let sampledTotal = 0

  for (const a of awards) {
    sampledTotal += a.award_amount
    if (a.awarding_agency) {
      const cur = agencyMap.get(a.awarding_agency) ?? { agency: a.awarding_agency, amount: 0, count: 0 }
      cur.amount = round2(cur.amount + a.award_amount)
      cur.count += 1
      agencyMap.set(a.awarding_agency, cur)
    }
    if (a.naics_code) {
      const cur = naicsMap.get(a.naics_code) ?? { naics: a.naics_code, amount: 0, count: 0 }
      cur.amount = round2(cur.amount + a.award_amount)
      cur.count += 1
      naicsMap.set(a.naics_code, cur)
    }
  }

  const byAmount = <T extends { amount: number }>(a: T, b: T) => b.amount - a.amount

  const recent_awards = [...awards]
    .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))
    .slice(0, recentN)

  return {
    recipient_name: recipientName,
    recipient_id: dominantRecipientId(awards),
    award_count: awards.length,
    sampled_total: round2(sampledTotal),
    top_agencies: [...agencyMap.values()].sort(byAmount).slice(0, topN),
    naics_spread: [...naicsMap.values()].sort(byAmount).slice(0, topN),
    recent_awards,
  }
}

/** Maps a raw USASpending spending_by_award result row to a ContractorAward. */
export function mapAwardRow(r: Record<string, unknown>, fallbackNaics: string | null): ContractorAward {
  return {
    award_id: String(r['Award ID'] ?? ''),
    description: String(r['Description'] ?? 'Federal Contract'),
    award_amount: Number(r['Award Amount'] ?? 0),
    awarding_agency: String(r['Awarding Agency Name'] ?? ''),
    start_date: r['Start Date'] ? String(r['Start Date']) : null,
    naics_code: String(r['NAICS Code'] ?? fallbackNaics ?? ''),
    // recipient_id is returned at the TOP LEVEL of each result row, not under a
    // space-separated display key. Verified live: "recipient_id": "b353...-C".
    recipient_id: String(r['recipient_id'] ?? ''),
  }
}

interface SpendingByAwardResponse {
  results?: Record<string, unknown>[]
}

/**
 * Fetches a contractor's footprint from USASpending. naicsCode (optional)
 * narrows the search to a domain when present. Never throws — failure is a
 * reason code.
 */
export async function fetchContractorProfile(
  recipientName: string,
  naicsCode: string | null,
  options: FetchOptions = {},
): Promise<ContractorXrayResult> {
  const name = recipientName?.trim()
  if (!name) return { ok: false, profile: null, reason: 'no_recipient' }

  const cacheKey = `xray:${name.toLowerCase()}:${naicsCode ?? 'all'}`
  const cached = getCached(cacheKey)
  if (cached) return { ok: true, profile: cached }

  const today = new Date()
  const fiveYearsAgo = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate())
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: Record<string, any> = {
    recipient_search_text: [name],
    award_type_codes: ['A', 'B', 'C', 'D'],
    time_period: [{ start_date: fmt(fiveYearsAgo), end_date: fmt(today) }],
  }
  if (naicsCode) filters.naics_codes = [naicsCode]

  const payload = {
    filters,
    fields: [
      'Award ID',
      'Description',
      'Award Amount',
      'Awarding Agency Name',
      'Start Date',
      'NAICS Code',
      'Recipient Name',
      'recipient_id', // ADDED per spec appendix — needed for call 2.
    ],
    sort: 'Award Amount',
    order: 'desc',
    limit: 100,
    page: 1,
  }

  const result = await fetchWithCircuitBreaker<SpendingByAwardResponse>(
    `${USASPENDING_BASE}${SPENDING_BY_AWARD_PATH}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    },
    options,
  )
  // Rewire #1: failure is a FetchResult state, not a thrown Response.
  if (result.source === 'failed') return { ok: false, profile: null, reason: 'api_error' }

  // Rewire #2: result.data is already parsed JSON.
  const results: Record<string, unknown>[] = result.data?.results ?? []

  // Keep only rows whose recipient actually matches (recipient_search_text is fuzzy).
  const normalized = name.toLowerCase()
  const awards = results
    .filter((r) => {
      const rn = String(r['Recipient Name'] ?? '').toLowerCase()
      return rn.includes(normalized) || normalized.includes(rn)
    })
    .map((r) => mapAwardRow(r, naicsCode))

  if (awards.length === 0) return { ok: true, profile: null, reason: 'no_results' }

  const profile = aggregateContractorProfile(name, awards)
  setCache(cacheKey, profile)
  return { ok: true, profile }
}
