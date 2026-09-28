import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

/** Non-federal companies must supply their own offer before template drafts exist. */
export async function processingBlockReason(supabase: SupabaseClient<Database>, companyId: string): Promise<string | null> {
  const { data: company, error: companyError } = await supabase.from('companies').select('legacy_sourcegent_defaults').eq('id', companyId).single()
  if (companyError || !company) return 'Could not verify the company profile.'
  if (company.legacy_sourcegent_defaults) return null
  const { data, error } = await supabase
    .from('outreach_offer_profiles')
    .select('company_id')
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) return 'Could not verify the company offer profile.'
  return data ? null : 'Complete Settings → Offer profile before processing contacts for this company.'
}
