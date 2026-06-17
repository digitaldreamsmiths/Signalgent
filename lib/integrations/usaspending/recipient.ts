/**
 * USASpending call 2 — recipient detail (socioeconomic flags). NET-NEW.
 *
 * GET /api/v2/recipient/<recipient_id>/ — pass the `-C` child-level id from
 * call 1 (verified to return business_types). This is the reliable source for
 * socioeconomic personalization; award-level `Type of Set Aside` is unreliable
 * (returned null on all of Eagle's awards) and must NOT be used for the signal.
 *
 * Two verified gotchas encoded here, not assumed:
 *   1. `business_types` (recipient level) is the socioeconomic source of truth.
 *   2. `total_transaction_amount` CAN BE NEGATIVE (Eagle: -1,621,943.99, net of
 *      de-obligations). It is NOT revenue and is used for nothing — we don't even
 *      surface it. Size signal comes from call 1's award amounts only.
 *
 * Wrapped in the same circuit breaker as call 1 for consistency.
 */

import { fetchWithCircuitBreaker, USASPENDING_BASE, type FetchOptions } from './base'

/** Subset of the recipient-detail response we actually consume. */
interface RecipientDetailResponse {
  name?: string
  uei?: string | null
  business_types?: string[]
  location?: {
    address_line1?: string | null
    address_line2?: string | null
    city_name?: string | null
    state_code?: string | null
    zip?: string | null
    zip5?: string | null
    country_name?: string | null
  } | null
  // NOTE: total_transaction_amount is intentionally NOT read — it can be
  // negative and is not revenue. See header.
}

export interface RecipientLocation {
  line1: string | null
  city: string | null
  state: string | null
  zip: string | null
  /** Single-line address for CAN-SPAM corroboration, or null if unavailable. */
  formatted: string | null
}

export interface RecipientDetail {
  recipient_id: string
  name: string | null
  uei: string | null
  /** Socioeconomic flags, e.g. ['service_disabled_veteran_owned_business','small_business']. */
  business_types: string[]
  location: RecipientLocation
}

export interface RecipientDetailResult {
  ok: boolean
  detail: RecipientDetail | null
  reason?: 'no_id' | 'not_found' | 'api_error'
}

function formatLocation(loc: RecipientDetailResponse['location']): RecipientLocation {
  const line1 = loc?.address_line1?.trim() || null
  const city = loc?.city_name?.trim() || null
  const state = loc?.state_code?.trim() || null
  const zip = (loc?.zip || loc?.zip5)?.trim() || null

  const parts: string[] = []
  if (line1) parts.push(line1)
  const cityStateZip = [city, state].filter(Boolean).join(', ')
  const tail = [cityStateZip, zip].filter(Boolean).join(' ')
  if (tail) parts.push(tail)
  const formatted = parts.length > 0 ? parts.join(', ') : null

  return { line1, city, state, zip, formatted }
}

/**
 * Fetches recipient-level detail (business_types, uei, location) for a
 * recipient_id obtained from call 1. Never throws — failure is a reason code.
 */
export async function fetchRecipientDetail(
  recipientId: string,
  options: FetchOptions = {},
): Promise<RecipientDetailResult> {
  const id = recipientId?.trim()
  if (!id) return { ok: false, detail: null, reason: 'no_id' }

  const result = await fetchWithCircuitBreaker<RecipientDetailResponse>(
    `${USASPENDING_BASE}/recipient/${encodeURIComponent(id)}/`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    options,
  )
  if (result.source === 'failed') return { ok: false, detail: null, reason: 'api_error' }

  const data = result.data
  // A missing/garbage id returns an error-ish body without business_types.
  if (!data || (!data.business_types && !data.uei && !data.name)) {
    return { ok: false, detail: null, reason: 'not_found' }
  }

  return {
    ok: true,
    detail: {
      recipient_id: id,
      name: data.name?.trim() || null,
      uei: data.uei?.trim() || null,
      business_types: Array.isArray(data.business_types) ? data.business_types : [],
      location: formatLocation(data.location),
    },
  }
}
