import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { usesUsaspending } from './usaspending-preference'

/** Non-federal companies must supply their own offer before template drafts exist. */
export async function processingBlockReason(supabase: SupabaseClient<Database>, companyId: string): Promise<string | null> {
  if (await usesUsaspending(supabase, companyId)) return null
  const { data, error } = await supabase
    .from('outreach_offer_profiles')
    .select('company_id')
    .eq('company_id', companyId)
    .maybeSingle()
  if (error) return 'Could not verify the company offer profile.'
  return data ? null : 'Complete Settings → Offer profile before processing non-federal contacts.'
}
