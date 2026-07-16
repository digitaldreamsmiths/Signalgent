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
  const { data } = await supabase
    .from('outreach_templates')
    .select('id, name, subject, body, weight, active, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
  return (data ?? []) as OutreachTemplate[]
}

function validate(input: { name: string; subject: string; body: string }): string | null {
  if (!input.name.trim()) return 'Give the template a name.'
  if (!input.subject.trim()) return 'The template needs a subject line.'
  if (!input.body.trim()) return 'The template needs a body.'
  return null
}

export async function createTemplate(
  companyId: string,
  input: { name: string; subject: string; body: string; weight?: number; active?: boolean },
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
  const { data, error } = await supabase
    .from('outreach_templates')
    .insert({
      company_id: companyId,
      name: input.name.trim(),
      subject: input.subject.trim(),
      body: input.body,
      weight: Math.max(1, Math.round(input.weight ?? 1)),
      active: input.active ?? true,
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: 'Could not save the template.' }
  revalidatePath('/outreach')
  return { ok: true, data: { id: data.id } }
}

export async function updateTemplate(
  companyId: string,
  id: string,
  patch: { name?: string; subject?: string; body?: string; weight?: number; active?: boolean },
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
  if (patch.weight !== undefined) next.weight = Math.max(1, Math.round(patch.weight))
  if (patch.active !== undefined) next.active = patch.active
  const nameBlank = patch.name !== undefined && !next.name
  const subjBlank = patch.subject !== undefined && !next.subject
  const bodyBlank = patch.body !== undefined && !(next.body ?? '').trim()
  if (nameBlank || subjBlank || bodyBlank) return { ok: false, error: 'Name, subject, and body can’t be blank.' }
  if (Object.keys(next).length === 0) return { ok: true, data: undefined }

  const supabase = await createClient()
  const { error } = await supabase.from('outreach_templates').update(next).eq('id', id).eq('company_id', companyId)
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
