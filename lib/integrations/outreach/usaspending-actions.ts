'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import type { ActionResult } from './types'

export async function setUsaspendingPreference(companyId: string, enabled: boolean): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: 'You don’t have access to this workspace.' }
    throw err
  }
  if (typeof enabled !== 'boolean') return { ok: false, error: 'Invalid setting.' }
  const supabase = await createClient()
  const { error } = await supabase.from('companies').update({ use_usaspending: enabled }).eq('id', companyId)
  if (error) return { ok: false, error: 'Could not save the USAspending setting.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}
