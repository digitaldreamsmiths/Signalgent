'use server'

/**
 * CRUD for user-authored fallback templates (the rotation pool used for prospects
 * that can't be personalized). Enrichment picks a weighted-random ACTIVE template
 * per fallback prospect (see enrich-run.ts `pickTemplateDraft`) and stamps its id
 * on the draft, so per-template reply/bounce/opt-out rates are trackable.
 *
 * Every action enforces requireCompanyAccess(companyId), mirroring the rest of the
 * outreach server actions' discriminated-result convention.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import type { Database } from '@/lib/types/database.types'
import type { ActionResult, OutreachTemplate } from './types'

type TemplateUpdate = Database['public']['Tables']['outreach_templates']['Update']

const AUTH_ERROR = 'You don’t have access to this workspace.'

export async function listTemplates(companyId: string): Promise<OutreachTemplate[]> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return []
    throw err
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outreach_templates')
    .select('id, name, subject, body, weight, active, followup_subject, followup_body, campaign_id, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
  if (!error) return (data ?? []) as OutreachTemplate[]
  // campaign_id arrives via an out-of-band migration; until it is applied the
  // list still has to show, with every template counted as shared.
  const { data: plain } = await supabase
    .from('outreach_templates')
    .select('id, name, subject, body, weight, active, followup_subject, followup_body, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
  return (plain ?? []).map((t) => ({ ...t, campaign_id: null })) as OutreachTemplate[]
}

const CAMPAIGN_COLUMN_PENDING = 'The campaign-templates migration hasn’t been applied to the database yet. Save the template without a campaign for now.'

/** A campaign the template may be scoped to: one of this company's own. */
async function campaignBelongs(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string, campaignId: string): Promise<boolean> {
  const { data } = await supabase.from('outreach_campaigns').select('id').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  return !!data
}

function validate(input: { name: string; subject: string; body: string }): string | null {
  if (!input.name.trim()) return 'Give the template a name.'
  if (!input.subject.trim()) return 'The template needs a subject line.'
  if (!input.body.trim()) return 'The template needs a body.'
  return null
}

export async function createTemplate(
  companyId: string,
  input: { name: string; subject: string; body: string; weight?: number; active?: boolean; followup_subject?: string | null; followup_body?: string | null; campaign_id?: string | null },
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const invalid = validate(input)
  if (invalid) return { ok: false, error: invalid }

  const supabase = await createClient()
  const campaignId = input.campaign_id || null
  if (campaignId && !(await campaignBelongs(supabase, companyId, campaignId))) return { ok: false, error: 'That campaign doesn’t belong to this workspace.' }
  const { data, error } = await supabase
    .from('outreach_templates')
    .insert({
      company_id: companyId,
      name: input.name.trim(),
      subject: input.subject.trim(),
      body: input.body,
      followup_subject: input.followup_subject?.trim() || null,
      followup_body: input.followup_body?.trim() || null,
      weight: Math.max(1, Math.round(input.weight ?? 1)),
      active: input.active ?? true,
      ...(campaignId ? { campaign_id: campaignId } : {}),
    })
    .select('id')
    .single()
  if (error && campaignId && /campaign_id/.test(error.message)) return { ok: false, error: CAMPAIGN_COLUMN_PENDING }
  if (error || !data) return { ok: false, error: 'Could not save the template.' }
  revalidatePath('/outreach')
  return { ok: true, data: { id: data.id } }
}

export async function updateTemplate(
  companyId: string,
  id: string,
  patch: { name?: string; subject?: string; body?: string; weight?: number; active?: boolean; followup_subject?: string | null; followup_body?: string | null; campaign_id?: string | null },
): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const next: TemplateUpdate = {}
  if (patch.name !== undefined) next.name = patch.name.trim()
  if (patch.subject !== undefined) next.subject = patch.subject.trim()
  if (patch.body !== undefined) next.body = patch.body
  if (patch.followup_subject !== undefined) next.followup_subject = patch.followup_subject?.trim() || null
  if (patch.followup_body !== undefined) next.followup_body = patch.followup_body?.trim() || null
  if (patch.weight !== undefined) next.weight = Math.max(1, Math.round(patch.weight))
  if (patch.active !== undefined) next.active = patch.active
  if (patch.campaign_id !== undefined) next.campaign_id = patch.campaign_id || null
  const nameBlank = patch.name !== undefined && !next.name
  const subjBlank = patch.subject !== undefined && !next.subject
  const bodyBlank = patch.body !== undefined && !(next.body ?? '').trim()
  if (nameBlank || subjBlank || bodyBlank) return { ok: false, error: 'Name, subject, and body can’t be blank.' }
  if (Object.keys(next).length === 0) return { ok: true, data: undefined }

  const supabase = await createClient()
  if (next.campaign_id && !(await campaignBelongs(supabase, companyId, next.campaign_id))) return { ok: false, error: 'That campaign doesn’t belong to this workspace.' }
  const { error } = await supabase.from('outreach_templates').update(next).eq('id', id).eq('company_id', companyId)
  if (error && patch.campaign_id !== undefined && /campaign_id/.test(error.message)) return { ok: false, error: CAMPAIGN_COLUMN_PENDING }
  if (error) return { ok: false, error: 'Could not update the template.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

export async function deleteTemplate(companyId: string, id: string): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  // Historical drafts keep their content; template_id nulls out via FK on delete.
  const { error } = await supabase.from('outreach_templates').delete().eq('id', id).eq('company_id', companyId)
  if (error) return { ok: false, error: 'Could not delete the template.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}
