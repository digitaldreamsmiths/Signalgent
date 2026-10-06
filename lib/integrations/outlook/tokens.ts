import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { decryptNullable, encrypt } from '@/lib/integrations/crypto'
import { getAccount, markError, updateAccount, upsertAccount } from '@/lib/integrations/accounts'
import { refreshToken, type MicrosoftTokens } from './fetch'
import { loadMicrosoftOAuthConfig } from './config'

export async function saveOutlookCredentials(companyId: string, email: string, tokens: MicrosoftTokens): Promise<void> {
  await upsertAccount({
    company_id: companyId,
    service: 'outlook',
    account_identifier: email,
    account_label: email,
    access_token: encrypt(tokens.access_token),
    refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope ?? null,
    scopes: tokens.scope?.split(/\s+/).filter(Boolean) ?? null,
    status: 'connected',
    last_error: null,
  })
}

export async function loadOutlookCredentials(companyId: string, client?: SupabaseClient<Database>): Promise<{
  accessToken: string; emailAddress: string
} | null> {
  const row = await getAccount(companyId, 'outlook', client)
  if (!row || row.status !== 'connected') return null
  let accessToken: string | null
  let refresh: string | null
  try {
    accessToken = decryptNullable(row.access_token)
    refresh = decryptNullable(row.refresh_token)
  } catch {
    await markError(companyId, 'outlook', 'Token decryption failed', client, row.id)
    return null
  }
  if (!accessToken) return null
  const emailAddress = row.account_identifier ?? ''
  if (!emailAddress.includes('@')) return null
  if (row.token_expires_at && new Date(row.token_expires_at).getTime() > Date.now() + 60_000) {
    return { accessToken, emailAddress }
  }
  if (!refresh) {
    await markError(companyId, 'outlook', 'Access token expired; reconnect the mailbox', client, row.id)
    return null
  }
  try {
    const config = await loadMicrosoftOAuthConfig(companyId, client)
    if (!config) throw new Error('Company Microsoft app registration is not configured')
    const tokens = await refreshToken(refresh, config)
    await updateAccount(companyId, 'outlook', {
      access_token: encrypt(tokens.access_token),
      refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : row.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope ?? row.scope,
      status: 'connected', last_error: null,
    }, client, row.id)
    return { accessToken: tokens.access_token, emailAddress }
  } catch {
    await markError(companyId, 'outlook', 'Token refresh failed; reconnect the mailbox', client, row.id)
    return null
  }
}
