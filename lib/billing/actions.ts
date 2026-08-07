'use server'

import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import { loadSettings, getEffectiveDailyCap, todayBounds } from '@/lib/integrations/outreach/send/worker'
import { effectiveLimits, loadBilling, loadUsage, monthStartIso, type BillingStatus } from './billing'
import type { PlanKey } from './plans'

export interface BillingOverview {
  plan_key: PlanKey
  plan_name: string
  status: BillingStatus
  /** No billing row — grandfathered, no limits applied. */
  unmanaged: boolean
  lapsed: boolean
  trial_days_left: number | null
  usage: {
    sends_today: number
    /** Today's cap after both the warmup ramp and the plan ceiling. */
    sends_cap: number
    enrichments_month: number
    enrichments_limit: number
    prospects: number
    prospects_limit: number
  }
}

/** Everything the Plan & usage page shows. Read-only. */
export async function getBillingOverview(companyId: string): Promise<BillingOverview | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }
  const supabase = await createClient()
  const [billing, usage, settings] = await Promise.all([
    loadBilling(supabase, companyId),
    loadUsage(supabase, companyId),
    loadSettings(supabase, companyId),
  ])
  const limits = effectiveLimits(billing)

  const { startIso, endIso } = todayBounds(settings)
  const { count: sentToday } = await supabase
    .from('outreach_sends')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .gte('sent_at', startIso)
    .lt('sent_at', endIso)

  return {
    plan_key: billing.plan.key,
    plan_name: billing.plan.name,
    status: billing.status,
    unmanaged: billing.unmanaged,
    lapsed: billing.lapsed,
    trial_days_left: billing.trial_days_left,
    usage: {
      sends_today: sentToday ?? 0,
      sends_cap: getEffectiveDailyCap(settings, new Date(), limits.maxDailySends),
      enrichments_month: usage.enrichments_month,
      enrichments_limit: limits.maxEnrichmentsMonth,
      prospects: usage.prospects_total,
      prospects_limit: limits.maxProspects,
    },
  }
}

/** First day of the current quota month, for the "resets on" line. */
export async function getQuotaMonthStart(): Promise<string> {
  return monthStartIso()
}
