/**
 * Entitlement resolution + usage metering — Phase 4 of
 * docs/specs/signalgent-govcon-v1.md.
 *
 * Plain module with an injected client (same split as send/worker.ts), so both
 * the user-scoped server actions and the unauthenticated cron resolve limits
 * identically.
 *
 * Two rules govern everything here:
 *   1. NO BILLING ROW = UNLIMITED. Tenants that predate billing keep working
 *      exactly as before; going on a plan is a deliberate act.
 *   2. Any read failure resolves to UNLIMITED too. A billing lookup must never
 *      be the reason a customer's sending stops — over-delivering on a quota
 *      is a support conversation, silently halting someone's outreach is a
 *      churn event.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { planByKey, UNLIMITED_PLAN, type Plan } from './plans'

type DB = SupabaseClient<Database>

export type BillingStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface Billing {
  plan: Plan
  status: BillingStatus
  trial_ends_at: string | null
  /** True when a trial has run out, or the subscription is canceled/past due.
   * Lapsed accounts keep their data and their UI — they just stop sending and
   * stop spending our LLM budget. */
  lapsed: boolean
  /** Whole days left in a trial (0 once expired, null when not trialing). */
  trial_days_left: number | null
  /** No row at all — grandfathered, not on any plan. */
  unmanaged: boolean
}

const UNMANAGED: Billing = {
  plan: UNLIMITED_PLAN,
  status: 'active',
  trial_ends_at: null,
  lapsed: false,
  trial_days_left: null,
  unmanaged: true,
}

export async function loadBilling(supabase: DB, companyId: string, now: Date = new Date()): Promise<Billing> {
  const { data, error } = await supabase
    .from('company_billing')
    .select('plan_key, status, trial_ends_at')
    .eq('company_id', companyId)
    .maybeSingle()
  // Missing row OR missing table (migration not applied) → unmanaged.
  if (error || !data) return { ...UNMANAGED }

  const status = (data.status ?? 'active') as BillingStatus
  const trialEnds = data.trial_ends_at ? new Date(data.trial_ends_at) : null
  const trialExpired = status === 'trialing' && !!trialEnds && trialEnds.getTime() <= now.getTime()
  const trial_days_left = status === 'trialing' && trialEnds
    ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / 86_400_000))
    : null

  return {
    plan: planByKey(data.plan_key),
    status,
    trial_ends_at: data.trial_ends_at,
    lapsed: trialExpired || status === 'canceled' || status === 'past_due',
    trial_days_left,
    unmanaged: false,
  }
}

/** A lapsed account sends nothing and enriches nothing; otherwise the plan's
 * numbers apply. Kept in one place so every enforcement point agrees. */
export function effectiveLimits(billing: Billing): { maxDailySends: number; maxEnrichmentsMonth: number; maxProspects: number } {
  if (billing.lapsed) return { maxDailySends: 0, maxEnrichmentsMonth: 0, maxProspects: billing.plan.max_prospects }
  return {
    maxDailySends: billing.plan.max_daily_sends,
    maxEnrichmentsMonth: billing.plan.max_enrichments_month,
    maxProspects: billing.plan.max_prospects,
  }
}

/** First instant of the current UTC calendar month — the window enrichment
 * quota is measured over. UTC (not the send timezone) so a quota month is the
 * same length for everyone and can't be shifted by changing a setting. */
export function monthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export interface UsageSnapshot {
  enrichments_month: number
  prospects_total: number
}

/** Current usage against the metered limits. Two counting reads, no row fetch. */
export async function loadUsage(supabase: DB, companyId: string, now: Date = new Date()): Promise<UsageSnapshot> {
  const since = monthStartIso(now)
  const [enriched, prospects] = await Promise.all([
    supabase
      .from('outreach_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('enriched_at', since)
      .then((r) => r.count ?? 0),
    supabase
      .from('outreach_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .then((r) => r.count ?? 0),
  ])
  return { enrichments_month: enriched, prospects_total: prospects }
}

/**
 * Enrichment headroom left this month. Returns Infinity when uncapped, so
 * callers can `Math.min(batchSize, headroom)` without special-casing.
 */
export async function enrichmentHeadroom(supabase: DB, companyId: string, now: Date = new Date()): Promise<number> {
  const billing = await loadBilling(supabase, companyId, now)
  const { maxEnrichmentsMonth } = effectiveLimits(billing)
  if (!Number.isFinite(maxEnrichmentsMonth)) return Infinity
  const { count } = await supabase
    .from('outreach_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gte('enriched_at', monthStartIso(now))
  return Math.max(0, maxEnrichmentsMonth - (count ?? 0))
}

/** The plan's daily send ceiling, for clamping the warmup cap. */
export async function planDailySendCap(supabase: DB, companyId: string, now: Date = new Date()): Promise<number> {
  return effectiveLimits(await loadBilling(supabase, companyId, now)).maxDailySends
}
