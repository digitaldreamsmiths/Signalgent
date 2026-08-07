/**
 * Campaigns — named slices of a company's prospect pool (Phase 1 of
 * docs/specs/signalgent-govcon-v1.md). Prospects join a campaign at ingest;
 * the workspace filters by campaign; the follow-up sweep resolves its config
 * per prospect (campaign override ?? company setting).
 *
 * Plain module, injected client, tolerant reads: the outreach_campaigns table
 * arrives via an out-of-band migration, and until then every read resolves to
 * "no campaigns" — the legacy campaign-less pool keeps working unchanged.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import type { SendSettings } from './types'

type DB = SupabaseClient<Database>

export interface OutreachCampaign {
  id: string
  name: string
  status: 'active' | 'archived'
  /** NULL = inherit the company-level setting; non-null wins. */
  followup_enabled: boolean | null
  followup_wait_days: number | null
  followup_max_touches: number | null
  created_at: string
}

/** The follow-up knobs a sequence actually runs on, after override resolution. */
export interface FollowupConfig {
  enabled: boolean
  waitDays: number
  maxTouches: number
}

/** Campaign override beats company setting, field by field. `campaign` null
 * (prospect in the legacy pool, campaign deleted, or table not migrated)
 * resolves to the company settings unchanged. */
export function resolveFollowupConfig(campaign: OutreachCampaign | null | undefined, settings: SendSettings): FollowupConfig {
  return {
    enabled: campaign?.followup_enabled ?? settings.followup_enabled,
    waitDays: campaign?.followup_wait_days ?? settings.followup_wait_days,
    maxTouches: campaign?.followup_max_touches ?? settings.followup_max_touches,
  }
}

/** All campaigns for a company, active first then newest first. Returns [] on
 * any error (most likely: the migration hasn't been applied yet). */
export async function loadCampaigns(supabase: DB, companyId: string): Promise<OutreachCampaign[]> {
  const { data, error } = await supabase
    .from('outreach_campaigns')
    .select('id, name, status, followup_enabled, followup_wait_days, followup_max_touches, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  const rows = data as OutreachCampaign[]
  return [...rows.filter((c) => c.status === 'active'), ...rows.filter((c) => c.status !== 'active')]
}

/** campaign_id per prospect for a set of prospect ids, chunked under PostgREST
 * URL limits. Best-effort: an error (e.g. campaign_id column not migrated)
 * yields an empty map — every prospect then resolves to company settings. */
export async function fetchProspectCampaignIds(
  supabase: DB,
  companyId: string,
  prospectIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  for (let i = 0; i < prospectIds.length; i += 150) {
    const chunk = prospectIds.slice(i, i + 150)
    const { data, error } = await supabase
      .from('outreach_prospects')
      .select('id, campaign_id')
      .eq('company_id', companyId)
      .in('id', chunk)
    if (error || !data) return new Map()
    for (const r of data) out.set(r.id, r.campaign_id)
  }
  return out
}
