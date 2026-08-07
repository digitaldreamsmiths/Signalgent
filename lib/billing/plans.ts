/**
 * Plan definitions — Phase 4 of docs/specs/signalgent-govcon-v1.md.
 *
 * One file, no database: adding or re-pricing a plan is a code change. The
 * `company_billing` row only ever stores a plan KEY, so limits can be tuned
 * without touching tenant data.
 *
 * Client-safe (no imports), so the pricing/usage UI can read the same numbers
 * the server enforces.
 */

export type PlanKey = 'unlimited' | 'trial' | 'starter' | 'growth'

export interface Plan {
  key: PlanKey
  name: string
  /** Monthly list price. 0 for trial; unlimited isn't sold. */
  price_usd_month: number
  /** Ceiling on sends per day, applied ON TOP of the user's own daily limit
   * (the smaller of the two wins). Infinity = uncapped. */
  max_daily_sends: number
  /** Prospects enriched per calendar month — the real cost driver, since each
   * one is an LLM round trip. */
  max_enrichments_month: number
  /** Total prospects stored for the company. */
  max_prospects: number
  /** Shown on the plan page; not enforced. */
  blurb: string
}

/**
 * The plan a company with NO billing row gets. Deliberately uncapped: every
 * tenant that predates billing keeps working untouched, and going on a plan is
 * an explicit act. Never sold, never assigned by Stripe.
 */
export const UNLIMITED_PLAN: Plan = {
  key: 'unlimited',
  name: 'Unlimited',
  price_usd_month: 0,
  max_daily_sends: Infinity,
  max_enrichments_month: Infinity,
  max_prospects: Infinity,
  blurb: 'No plan limits applied.',
}

/** The sellable plans, in display order. Numbers are the starting point from
 * the spec's $99–299 target and are meant to be tuned against real usage. */
export const PLANS: Plan[] = [
  {
    key: 'trial',
    name: 'Trial',
    price_usd_month: 0,
    max_daily_sends: 5,
    max_enrichments_month: 200,
    max_prospects: 500,
    blurb: 'Try the whole pipeline on a small list. Real sends are capped low so a trial can’t hurt your domain.',
  },
  {
    key: 'starter',
    name: 'Starter',
    price_usd_month: 99,
    max_daily_sends: 50,
    max_enrichments_month: 2_000,
    max_prospects: 10_000,
    blurb: 'One sender, steady drip. Fits a solo founder or a small capture team.',
  },
  {
    key: 'growth',
    name: 'Growth',
    price_usd_month: 299,
    max_daily_sends: 200,
    max_enrichments_month: 10_000,
    max_prospects: 50_000,
    blurb: 'Higher volume and a bigger research budget for a full outbound motion.',
  },
]

export function planByKey(key: string | null | undefined): Plan {
  return PLANS.find((p) => p.key === key) ?? UNLIMITED_PLAN
}

/** Formats a limit for display, since Infinity shouldn't reach a user. */
export function fmtLimit(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString('en-US') : 'Unlimited'
}
