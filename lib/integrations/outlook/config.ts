import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { decrypt, encrypt } from '@/lib/integrations/crypto'
import { createClient } from '@/lib/supabase/server'

export interface MicrosoftOAuthConfig {
  tenantId: string
  clientId: string
  clientSecret: string
}

export async function loadMicrosoftOAuthConfig(
  companyId: string,
  client?: SupabaseClient<Database>,
): Promise<MicrosoftOAuthConfig | null> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase.from('company_microsoft_oauth_configs')
    .select('tenant_id,client_id,client_secret_ciphertext')
    .eq('company_id', companyId).maybeSingle()
  if (error) throw new Error(`Microsoft configuration lookup failed: ${error.message}`)
  if (!data) return null
  return {
    tenantId: data.tenant_id,
    clientId: data.client_id,
    clientSecret: decrypt(data.client_secret_ciphertext),
  }
}

export async function saveMicrosoftOAuthConfig(
  companyId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('company_microsoft_oauth_configs').upsert({
    company_id: companyId,
    tenant_id: tenantId,
    client_id: clientId,
    client_secret_ciphertext: encrypt(clientSecret),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' })
  if (error) throw new Error(`Microsoft configuration save failed: ${error.message}`)
}
