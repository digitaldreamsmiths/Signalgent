/**
 * The per-tenant offer profile — what is being pitched, by whom, to whom.
 * Phase 0 of the govcon productization plan (docs/specs/signalgent-govcon-v1.md):
 * everything the drafting register, built-in templates, and signatures used to
 * hardcode about SourceGent now flows from here.
 *
 * Client-safe: imports nothing but Supabase types, so client components (the
 * template editor's starter library) can read the type and defaults without
 * pulling server code into the browser bundle. The loader takes an injected
 * client, same pattern as loadSettings in send/worker.ts, so it runs under both
 * user-scoped server actions and the unauthenticated cron.
 *
 * Defensive by design: the migration creating outreach_offer_profiles is
 * applied out-of-band, so a missing table, a missing row, and a partial row all
 * resolve to the SourceGent defaults. Behavior is byte-identical for the
 * existing tenant until a profile is saved.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

export interface OfferProfile {
  /** Product name as it appears in prose ("SourceGent"). */
  product: string
  /** Bare domain for signatures ("sourcegent.io"). */
  site: string
  /** Signature block pieces. */
  sign_off: string
  signature_name: string
  /** Social proof, phrased for prose. Deliberately approximate, never inflated. */
  user_count: string
  /** Aggregate result the user base gets, for prose ("over $4M in active pursuits"). */
  pipeline: string
  /** Who the recipient is, for the register ("a government contractor"). */
  audience: string
  /** One or two concrete sentences describing what the product does. */
  pitch: string
  /** Concrete artifacts the pitch may name; the register requires at least one. */
  artifacts: string[]
}

export const DEFAULT_OFFER_PROFILE: OfferProfile = {
  product: 'SourceGent',
  site: 'sourcegent.io',
  sign_off: 'Best',
  signature_name: 'Eudon Delemar',
  user_count: 'About twenty contractors',
  pipeline: 'over $4M in active pursuits',
  audience: 'a government contractor',
  pitch:
    'Contractors use it to shred a solicitation into a compliance matrix and get a first draft back the same day, in their voice, on their strategy.',
  artifacts: [
    'shred the solicitation',
    'compliance matrix',
    'first draft the same day',
    'past performance write-up',
    'Section L',
    'Section M',
    'pink team',
  ],
}

/** Lowercased mid-sentence form of the user count ("...which about twenty..."). */
export function userCountMid(profile: OfferProfile): string {
  return profile.user_count.charAt(0).toLowerCase() + profile.user_count.slice(1)
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  return out.length > 0 ? out : null
}

type DB = SupabaseClient<Database>

/**
 * Load a company's offer profile, falling back to the SourceGent defaults
 * per-field. A query error (e.g. the migration hasn't been applied yet) is
 * treated as "no row" rather than surfacing — the profile must never be the
 * reason enrichment or sending stops.
 */
export async function loadOfferProfile(supabase: DB, companyId: string): Promise<OfferProfile> {
  const { data, error } = await supabase
    .from('outreach_offer_profiles')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()
  if (error || !data) return { ...DEFAULT_OFFER_PROFILE }
  const d = DEFAULT_OFFER_PROFILE
  return {
    product: data.product?.trim() || d.product,
    site: data.site?.trim() || d.site,
    sign_off: data.sign_off?.trim() || d.sign_off,
    signature_name: data.signature_name?.trim() || d.signature_name,
    user_count: data.user_count?.trim() || d.user_count,
    pipeline: data.pipeline?.trim() || d.pipeline,
    audience: data.audience?.trim() || d.audience,
    pitch: data.pitch?.trim() || d.pitch,
    artifacts: asStringArray(data.artifacts) ?? d.artifacts,
  }
}
