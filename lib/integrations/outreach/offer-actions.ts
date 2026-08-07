'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import { loadOfferProfile, type OfferProfile } from './offer-profile'
import type { ActionResult } from './types'

const AUTH_ERROR = 'You don’t have access to this workspace.'

/** The company's offer profile, with SourceGent defaults filling any gaps. */
export async function getOfferProfile(companyId: string): Promise<OfferProfile | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }
  const supabase = await createClient()
  return loadOfferProfile(supabase, companyId)
}

/** Save the company's offer profile (full replace — the form always submits
 * every field). Blank required fields are rejected rather than silently
 * falling back, so what the user sees in the form is what the pipeline uses. */
export async function saveOfferProfile(companyId: string, profile: OfferProfile): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }

  const required: [keyof OfferProfile, string][] = [
    ['product', 'Product name'],
    ['site', 'Site'],
    ['sign_off', 'Sign-off'],
    ['signature_name', 'Signature name'],
    ['user_count', 'User count phrase'],
    ['pipeline', 'Results phrase'],
    ['audience', 'Audience'],
    ['pitch', 'Pitch'],
  ]
  for (const [key, label] of required) {
    const v = profile[key]
    if (typeof v !== 'string' || !v.trim()) return { ok: false, error: `${label} can’t be empty.` }
  }
  const artifacts = (profile.artifacts ?? []).map((a) => a.trim()).filter(Boolean)
  if (artifacts.length === 0) return { ok: false, error: 'List at least one concrete artifact.' }

  const supabase = await createClient()
  const { error } = await supabase.from('outreach_offer_profiles').upsert(
    {
      company_id: companyId,
      product: profile.product.trim(),
      site: profile.site.trim(),
      sign_off: profile.sign_off.trim(),
      signature_name: profile.signature_name.trim(),
      user_count: profile.user_count.trim(),
      pipeline: profile.pipeline.trim(),
      audience: profile.audience.trim(),
      pitch: profile.pitch.trim(),
      artifacts,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id' },
  )
  if (error) {
    // The table arrives via an out-of-band migration; say so instead of a
    // generic failure when it isn't there yet.
    const missing = /outreach_offer_profiles/.test(error.message) && /(not exist|not find|schema cache)/i.test(error.message)
    return { ok: false, error: missing ? 'The offer-profile migration hasn’t been applied to the database yet.' : 'Could not save the offer profile.' }
  }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}
