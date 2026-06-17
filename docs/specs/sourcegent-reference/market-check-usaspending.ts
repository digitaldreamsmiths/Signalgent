/**
 * USASpending.gov client — POST /api/v2/search/spending_by_award/.
 *
 * Public endpoint, no key required. We query the top 100 awards over the last
 * 24 months for a given NAICS code, with a $25k floor to exclude micro-
 * purchases that distort the lower percentile.
 *
 * Award type codes A/B/C/D = definitive contracts (excludes grants, loans, IDV
 * base awards). Award amounts are contract totals, not labor rates — this is
 * contract-level cost realism context, not rate-level.
 *
 * The client returns the parsed response shape; percentile computation lives
 * in the normalizer (Phase 4).
 */

import { fetchWithCircuitBreaker, type FetchOptions, type FetchResult } from './base'

const USASPENDING_BASE = 'https://api.usaspending.gov/api/v2'
const SPENDING_BY_AWARD_PATH = '/search/spending_by_award/'

const AWARD_TYPE_CODES = ['A', 'B', 'C', 'D'] as const
export const LOWER_BOUND_USD = 25_000
const PAGE_SIZE = 100
export const LOOKBACK_DAYS = 730 // ≈ 2 years

// ─── Tier bucketing (PR-B) ────────────────────────────────────────────────
//
// Three size tiers. Proposal total_price drives tier selection; the resulting
// award-amount band is what gets passed to USASpending. Tier definitions
// overlap intentionally so the boundary between "small but high-end" and "mid
// but low-end" doesn't produce sample-size cliffs.

export type Tier = 'small' | 'mid' | 'enterprise'

export interface AwardAmountBand {
  /** Inclusive lower bound in USD. */
  lower: number
  /** Inclusive upper bound in USD. Omit for no upper bound (enterprise tier). */
  upper?: number
}

export const TIER_BANDS: Record<Tier, AwardAmountBand> = {
  small:      { lower: 25_000,    upper: 1_000_000 },
  mid:        { lower: 500_000,   upper: 10_000_000 },
  enterprise: { lower: 5_000_000 },
}

/**
 * Maps a proposal's total_price to its tier. Null/zero/non-finite total falls
 * to `small` — the safest default since under-bucketed proposals lose less
 * information than over-bucketed ones (small queries return more results).
 */
export function tierFromTotal(total: number | null | undefined): Tier {
  if (total == null || !Number.isFinite(total) || total <= 0) return 'small'
  if (total < 1_000_000)   return 'small'
  if (total <= 10_000_000) return 'mid'
  return 'enterprise'
}

/** One award row from spending_by_award. Keys are space-separated by USASpending convention. */
export interface UsaSpendingAwardRow {
  'Award Amount': number
  'Awarding Agency Name': string
  'Period of Performance Start Date': string
  'Period of Performance Current End Date': string
  'NAICS Code': string
  'NAICS Description': string
}

export interface UsaSpendingAwardsResponse {
  results: UsaSpendingAwardRow[]
  page_metadata: {
    page: number
    hasNext: boolean
    last_record_unique_id?: string
  }
}

interface AgencyFilter {
  type: 'awarding' | 'funding'
  tier: 'toptier' | 'subtier'
  name: string
}

interface RequestBody {
  filters: {
    award_type_codes: string[]
    naics_codes: string[]
    time_period: Array<{ start_date: string; end_date: string }>
    award_amounts: Array<{ lower_bound: number; upper_bound?: number }>
    agencies?: AgencyFilter[]
  }
  fields: string[]
  sort: string
  order: 'asc' | 'desc'
  limit: number
  page: number
}

export interface UsaSpendingQueryOptions {
  /** Award amount band. Omit → use the legacy $25k floor with no upper bound. */
  band?: AwardAmountBand
  /**
   * Awarding agency canonical name (toptier). When set, filter to awards
   * where this agency is the awarding party. Omit → no agency filter
   * (broader-market lens).
   */
  agencyName?: string
}

function isoDateNDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function isoDateToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function buildUsaSpendingRequestBody(
  naicsCode: string,
  now: Date = new Date(),
  options: UsaSpendingQueryOptions = {},
): RequestBody {
  const band = options.band ?? { lower: LOWER_BOUND_USD }
  const award_amounts: RequestBody['filters']['award_amounts'] = [
    band.upper != null
      ? { lower_bound: band.lower, upper_bound: band.upper }
      : { lower_bound: band.lower },
  ]

  const filters: RequestBody['filters'] = {
    award_type_codes: [...AWARD_TYPE_CODES],
    naics_codes: [naicsCode],
    time_period: [
      {
        start_date: isoDateNDaysAgo(LOOKBACK_DAYS, now),
        end_date: isoDateToday(now),
      },
    ],
    award_amounts,
  }

  if (options.agencyName) {
    filters.agencies = [
      { type: 'awarding', tier: 'toptier', name: options.agencyName },
    ]
  }

  return {
    filters,
    fields: [
      'Award Amount',
      'Awarding Agency Name',
      'Period of Performance Start Date',
      'Period of Performance Current End Date',
      'NAICS Code',
      'NAICS Description',
    ],
    sort: 'Award Amount',
    order: 'desc',
    limit: PAGE_SIZE,
    page: 1,
  }
}

/**
 * Fetches the top 100 awards by amount for a NAICS code over the last 2 years.
 * Returns FetchResult<UsaSpendingAwardsResponse> — never throws.
 *
 * Optional band/agency narrowing (PR-B): pass `band` for tier-bucketed filter,
 * `agencyName` (canonical toptier name from /v2/autocomplete/awarding_agency)
 * for the agency-cohort lens. Omit both for the legacy NAICS-wide query.
 */
export async function fetchUsaSpendingAwardsByNaics(
  naicsCode: string,
  options: FetchOptions & UsaSpendingQueryOptions = {},
  now: Date = new Date(),
): Promise<FetchResult<UsaSpendingAwardsResponse>> {
  const { band, agencyName, ...fetchOpts } = options
  const body = buildUsaSpendingRequestBody(naicsCode, now, { band, agencyName })
  return fetchWithCircuitBreaker<UsaSpendingAwardsResponse>(
    `${USASPENDING_BASE}${SPENDING_BY_AWARD_PATH}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    },
    fetchOpts,
  )
}

// ─── Agency resolution (PR-B) ─────────────────────────────────────────────
//
// USASpending's `agencies` filter expects a canonical toptier name like
// "DEPT OF THE ARMY". Our DB stores `rfps.issuing_organization` as freeform
// text ("U.S. Army Mission and Installation Contracting Command (MICC) –
// Fort Benning, Department of the Army") which is NOT directly accepted.
//
// `/v2/autocomplete/awarding_agency/` takes a search string and returns
// matched toptier and subtier agencies. We always pick the top toptier hit;
// missing → null. The runner caches the resolution for 365 days (agency
// canonical names are extremely stable).

const AUTOCOMPLETE_AWARDING_AGENCY_PATH = '/autocomplete/awarding_agency/'

interface AwardingAgencyAutocompleteResponse {
  results?: {
    toptier_agency?: Array<{ name: string; abbreviation?: string | null }>
    subtier_agency?: Array<{ name: string; abbreviation?: string | null }>
  }
}

export interface ResolveAwardingAgencyResult {
  /** Canonical toptier name suitable for the `agencies` filter. Null on miss. */
  resolved: string | null
}

/**
 * Looks up the canonical toptier awarding-agency name for a freeform
 * search string. Returns `{ resolved: null }` on no match or API failure;
 * caller falls back to omitting the agency lens.
 */
export async function resolveAwardingAgency(
  searchText: string,
  options: FetchOptions = {},
): Promise<FetchResult<ResolveAwardingAgencyResult>> {
  const trimmed = searchText.trim()
  if (trimmed.length === 0) {
    return { source: 'live', data: { resolved: null }, durationMs: 0 }
  }

  const fetched = await fetchWithCircuitBreaker<AwardingAgencyAutocompleteResponse>(
    `${USASPENDING_BASE}${AUTOCOMPLETE_AWARDING_AGENCY_PATH}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ search_text: trimmed, limit: 5 }),
    },
    options,
  )

  if (fetched.source === 'failed' || !fetched.data) {
    return fetched as FetchResult<ResolveAwardingAgencyResult>
  }

  const toptier = fetched.data.results?.toptier_agency?.[0]
  const resolved = toptier?.name && typeof toptier.name === 'string' && toptier.name.length > 0
    ? toptier.name
    : null

  return { source: 'live', data: { resolved }, durationMs: fetched.durationMs }
}

/**
 * Validates the NAICS code against USASpending's reference endpoint. Used by
 * the NAICS resolver to confirm a user-provided override is real before
 * spending API quota on a doomed query.
 *
 * Endpoint: GET /references/naics/<code>/. Returns 200 with the description on
 * valid codes; 404 on invalid. Non-200 → returns null (treat as unknown).
 */
export async function validateNaicsViaUsaSpending(
  naicsCode: string,
  options: FetchOptions = {},
): Promise<{ valid: boolean; description?: string }> {
  const result = await fetchWithCircuitBreaker<{
    results: Array<{ naics: string; naics_description: string }>
  }>(
    `${USASPENDING_BASE}/references/naics/${encodeURIComponent(naicsCode)}/`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    options,
  )
  if (result.source === 'failed' || !result.data) return { valid: false }
  const match = result.data.results?.[0]
  if (!match) return { valid: false }
  return { valid: true, description: match.naics_description }
}
