'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import { companyProfileValues, type CompanyProfileInput } from '@/lib/company-profile'
import { normalizeWebsiteUrl } from '@/lib/utils'
import type { ActionResult } from '@/lib/integrations/outreach/types'
import type { OfferProfile } from '@/lib/integrations/outreach/offer-profile'
import type { Company } from '@/lib/types'
import type { Database } from '@/lib/types/database.types'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function createCompanyWithProfile(currentCompanyId: string, input: {
  name: string; industry: string; website: string; useUsaspending: boolean
  identity: CompanyProfileInput; offer: OfferProfile
}): Promise<ActionResult<Company>> {
  let access
  try { access = await requireCompanyAccess(currentCompanyId) }
  catch (error) {
    if (error instanceof IntegrationAuthError) return { ok: false, error: 'You don’t have access to this workspace.' }
    throw error
  }
  const name = input.name?.trim()
  const identity = input.identity
  const offer = input.offer
  if (!name || !slugify(name) || !identity?.description?.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.contact_email ?? '') ||
      !offer?.product?.trim() || !offer.site?.trim() || !offer.sign_off?.trim() ||
      !offer.signature_name?.trim() || !offer.audience?.trim() || !offer.pitch?.trim() ||
      !Array.isArray(offer.artifacts) || !offer.artifacts.some(a => a.trim())) {
    return { ok: false, error: 'Complete the company identity and outreach offer.' }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Server is missing Supabase configuration.' }
  const db = createServiceClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const values = {
    workspace_id: access.workspaceId, name, industry: input.industry?.trim() || null,
    website: normalizeWebsiteUrl(input.website ?? ''), use_usaspending: input.useUsaspending === true,
    ...companyProfileValues(identity),
  }
  let slug = slugify(name)
  let result = await db.from('companies').insert({ ...values, slug }).select().single()
  if (result.error?.code === '23505') {
    slug = `${slug}-${crypto.randomUUID().slice(0, 8)}`
    result = await db.from('companies').insert({ ...values, slug }).select().single()
  }
  if (result.error || !result.data) return { ok: false, error: 'Could not add company.' }
  const company = result.data
  const { error } = await db.from('outreach_offer_profiles').insert({
    company_id: company.id, product: offer.product.trim(), site: offer.site.trim(),
    sign_off: offer.sign_off.trim(), signature_name: offer.signature_name.trim(),
    user_count: offer.user_count?.trim() ?? '', pipeline: offer.pipeline?.trim() ?? '',
    audience: offer.audience.trim(), pitch: offer.pitch.trim(),
    artifacts: offer.artifacts.map(a => a.trim()).filter(Boolean),
  })
  if (error) {
    await db.from('companies').delete().eq('id', company.id)
    return { ok: false, error: 'Could not save the company offer profile.' }
  }
  revalidatePath('/today')
  return { ok: true, data: company }
}

export async function saveCompanyProfile(companyId: string, input: {
  name: string; industry: string; website: string; useUsaspending: boolean; identity: CompanyProfileInput
}): Promise<ActionResult> {
  try { await requireCompanyAccess(companyId) }
  catch (error) {
    if (error instanceof IntegrationAuthError) return { ok: false, error: 'You don’t have access to this company.' }
    throw error
  }
  if (!input.name.trim() || !input.identity.description.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.identity.contact_email)) {
    return { ok: false, error: 'Company name, description, and a valid contact email are required.' }
  }
  const db = await createClient()
  const { error } = await db.from('companies').update({
    name: input.name.trim(), industry: input.industry.trim() || null,
    website: normalizeWebsiteUrl(input.website), use_usaspending: input.useUsaspending,
    ...companyProfileValues(input.identity), updated_at: new Date().toISOString(),
  }).eq('id', companyId)
  if (error) return { ok: false, error: 'Could not save this company profile.' }
  revalidatePath('/today')
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}
