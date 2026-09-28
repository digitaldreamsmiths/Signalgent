import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

/** Fail closed if the preference cannot be read; never search against an unknown choice. */
export async function usesUsaspending(supabase: SupabaseClient<Database>, companyId: string): Promise<boolean> {
  const { data, error } = await supabase.from('companies').select('use_usaspending').eq('id', companyId).single()
  if (error || !data) throw new Error('Could not read the company’s USAspending setting.')
  return data.use_usaspending
}
