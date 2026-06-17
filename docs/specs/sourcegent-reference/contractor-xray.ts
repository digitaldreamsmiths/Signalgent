// Contractor X-ray (contractorXray capability — government_bid only).
//
// On-demand deep dive on a single federal contractor (a likely competitor /
// suspected incumbent). Reuses the proven USASpending spending_by_award client
// + in-memory cache from usaspending-intel.ts. Deterministic only — no AI, no DB.
//
// The profile is framed as a footprint across the contractor's LARGEST recent
// awards (not a lifetime obligation total), since we aggregate client-side from
// a bounded spending_by_award page. The UI labels it accordingly.

import { fetchWithRetry } from '@/lib/fetchWithRetry'

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
  }
}

/**
 * Fetches a contractor's footprint from USASpending. naicsCode (optional)
 * narrows the search to the RFP's domain when present.
 */
export async function fetchContractorProfile(
  recipientName: string,
  naicsCode: string | null,
): Promise<ContractorXrayResult> {
  const name = recipientName?.trim()
  if (!name) return { ok: false, profile: null, reason: 'no_recipient' }

  const cacheKey = `xray:${name.toLowerCase()}:${naicsCode ?? 'all'}`
  const cached = getCached(cacheKey)
  if (cached) return { ok: true, profile: cached }

  try {
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
      fields: ['Award ID', 'Description', 'Award Amount', 'Awarding Agency Name', 'Start Date', 'NAICS Code', 'Recipient Name'],
      sort: 'Award Amount',
      order: 'desc',
      limit: 100,
      page: 1,
    }

    const res = await fetchWithRetry('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { ok: false, profile: null, reason: 'api_error' }

    const data = await res.json()
    const results: Record<string, unknown>[] = data?.results ?? []

    // Keep only rows whose recipient actually matches (recipient_search_text is fuzzy).
    const normalized = name.toLowerCase()
    const awards = results
      .filter(r => {
        const rn = String(r['Recipient Name'] ?? '').toLowerCase()
        return rn.includes(normalized) || normalized.includes(rn)
      })
      .map(r => mapAwardRow(r, naicsCode))

    if (awards.length === 0) return { ok: true, profile: null, reason: 'no_results' }

    const profile = aggregateContractorProfile(name, awards)
    setCache(cacheKey, profile)
    return { ok: true, profile }
  } catch {
    return { ok: false, profile: null, reason: 'api_error' }
  }
}
