'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import { loadCampaigns, type OutreachCampaign } from './campaigns'
import type { ActionResult } from './types'

const AUTH_ERROR = 'You don’t have access to this workspace.'
const MIGRATION_ERROR = 'The campaigns migration hasn’t been applied to the database yet.'

function isMissingTable(message: string): boolean {
  return /outreach_campaigns|campaign_id/.test(message) && /(not exist|not find|schema cache)/i.test(message)
}

export async function listCampaigns(companyId: string): Promise<OutreachCampaign[]> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return []
    throw err
  }
  const supabase = await createClient()
  return loadCampaigns(supabase, companyId)
}

export async function createCampaign(companyId: string, name: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Give the campaign a name.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outreach_campaigns')
    .insert({ company_id: companyId, name: trimmed })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error && isMissingTable(error.message) ? MIGRATION_ERROR : 'Could not create the campaign.' }
  revalidatePath('/outreach')
  return { ok: true, data: { id: data.id } }
}

/** Rename, archive/unarchive, or set follow-up overrides (null = inherit). */
export async function updateCampaign(
  companyId: string,
  campaignId: string,
  patch: Partial<Pick<OutreachCampaign, 'name' | 'status' | 'followup_enabled' | 'followup_wait_days' | 'followup_max_touches'>>,
): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (typeof patch.name === 'string' && !patch.name.trim()) return { ok: false, error: 'A campaign needs a name.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_campaigns')
    .update({ ...patch, ...(typeof patch.name === 'string' ? { name: patch.name.trim() } : {}), updated_at: new Date().toISOString() })
    .eq('id', campaignId)
    .eq('company_id', companyId)
  if (error) return { ok: false, error: isMissingTable(error.message) ? MIGRATION_ERROR : 'Could not update the campaign.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

/** Move prospects into a campaign (or out of any, with null). */
export async function assignProspectsToCampaign(
  companyId: string,
  prospectIds: string[],
  campaignId: string | null,
): Promise<ActionResult<{ moved: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (prospectIds.length === 0) return { ok: true, data: { moved: 0 } }
  const supabase = await createClient()
  let moved = 0
  for (let i = 0; i < prospectIds.length; i += 150) {
    const chunk = prospectIds.slice(i, i + 150)
    const { data, error } = await supabase
      .from('outreach_prospects')
      .update({ campaign_id: campaignId })
      .eq('company_id', companyId)
      .in('id', chunk)
      .select('id')
    if (error) return { ok: false, error: isMissingTable(error.message) ? MIGRATION_ERROR : 'Could not move the prospects.' }
    moved += data?.length ?? 0
  }
  revalidatePath('/outreach')
  return { ok: true, data: { moved } }
}
