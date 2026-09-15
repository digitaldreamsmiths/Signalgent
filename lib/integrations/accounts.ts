/**
 * connected_accounts CRUD.
 *
 * This file is deliberately dumb. It reads and writes rows as-is.
 * No encryption, no provider logic, no cache invalidation. Callers
 * that deal in plaintext tokens must encrypt before reaching here
 * (see lib/integrations/stripe/tokens.ts for an example).
 *
 * All functions use the server Supabase client and respect RLS.
 */

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import type {
  ConnectedAccount,
  InsertTables,
  UpdateTables,
} from '@/lib/types'

export type ConnectedService = ConnectedAccount['service']
export type ConnectedStatus = ConnectedAccount['status']

/** A Supabase client callers can inject — e.g. a service-role client from the
 * unauthenticated cron path, where the default SSR client has no session. */
type DbClient = SupabaseClient<Database>

/** Fetch a single account by (companyId, service). Returns null if not found. */
export async function getAccount(
  companyId: string,
  service: ConnectedService,
  client?: DbClient,
  accountId?: string
): Promise<ConnectedAccount | null> {
  const supabase = client ?? await createClient()
  let query = supabase.from('connected_accounts').select('*').eq('company_id', companyId).eq('service', service)
  if (accountId) query = query.eq('id', accountId)
  const { data, error } = await query.order('created_at').order('id').limit(1).maybeSingle()

  if (error) {
    throw new Error(`getAccount failed: ${error.message}`)
  }
  return data
}

/** List all accounts for a company. Useful for settings pages. */
export async function listAccounts(companyId: string): Promise<ConnectedAccount[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('connected_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`listAccounts failed: ${error.message}`)
  }
  return data ?? []
}

/**
 * Save an account by company, service, and identity on either database layout.
 * Callers pass already-encrypted token fields.
 */
export async function upsertAccount(
  row: InsertTables<'connected_accounts'>
): Promise<ConnectedAccount> {
  const supabase = await createClient()
  const values = { ...row, account_identifier: row.account_identifier ?? row.service }
  const find = () => supabase.from('connected_accounts').select('*')
    .eq('company_id', row.company_id).eq('service', row.service)
    .eq('account_identifier', values.account_identifier).maybeSingle()
  const update = async (existing: ConnectedAccount) => {
    const { id, company_id, service, created_at, ...patch } = values
    void id; void company_id; void service; void created_at
    const { data, error } = await supabase.from('connected_accounts')
      .update({ ...patch, refresh_token: values.refresh_token ?? existing.refresh_token })
      .eq('id', existing.id).eq('company_id', row.company_id).eq('service', row.service)
      .select('*').single()
    if (error) throw new Error(`upsertAccount failed: ${error.message}`)
    return data
  }
  // Reconnect an existing identity without depending on the new unique index.
  const existing = await find()
  if (existing.error) throw new Error(`upsertAccount failed: ${existing.error.message}`)
  if (existing.data) return update(existing.data)
  const inserted = await supabase.from('connected_accounts').insert(values).select('*').single()
  if (!inserted.error) return inserted.data
  if (inserted.error.code === '23505') {
    const raced = await find()
    if (raced.error) throw new Error(`upsertAccount failed: ${raced.error.message}`)
    if (raced.data) return update(raced.data)
    // The legacy schema must never let a second mailbox replace the first.
    throw new Error('ACCOUNT_MIGRATION_REQUIRED')
  }
  throw new Error(`upsertAccount failed: ${inserted.error.message}`)
}

/** Patch an existing row by (companyId, service). Returns the updated row. */
export async function updateAccount(
  companyId: string,
  service: ConnectedService,
  patch: UpdateTables<'connected_accounts'>,
  client?: DbClient,
  accountId?: string
): Promise<ConnectedAccount | null> {
  const supabase = client ?? await createClient()
  const account = await getAccount(companyId, service, supabase, accountId)
  if (!account) return null
  const { data, error } = await supabase
    .from('connected_accounts')
    .update(patch)
    .eq('id', account.id)
    .eq('company_id', companyId)
    .eq('service', service)
    .select('*')
    .maybeSingle()

  if (error) {
    throw new Error(`updateAccount failed: ${error.message}`)
  }
  return data
}

/**
 * Soft delete: sets status to 'disconnected' and nulls tokens but keeps the
 * row for audit. For a hard delete use deleteAccount.
 */
export async function markDisconnected(
  companyId: string,
  service: ConnectedService
): Promise<void> {
  await updateAccount(companyId, service, {
    status: 'disconnected',
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    last_error: null,
  })
}

/** Hard delete. Prefer markDisconnected unless you really need the row gone. */
export async function deleteAccount(
  companyId: string,
  service: ConnectedService
): Promise<void> {
  const supabase = await createClient()
  const account = await getAccount(companyId, service, supabase)
  if (!account) return
  const { error } = await supabase
    .from('connected_accounts')
    .delete()
    .eq('id', account.id)
    .eq('company_id', companyId)
    .eq('service', service)
  if (error) {
    throw new Error(`deleteAccount failed: ${error.message}`)
  }
}

/** Record a successful sync. Bumps last_synced_at, clears last_error. */
export async function markSynced(
  companyId: string,
  service: ConnectedService
): Promise<void> {
  await updateAccount(companyId, service, {
    last_synced_at: new Date().toISOString(),
    last_error: null,
    status: 'connected',
  })
}

/** Record an error state. */
export async function markError(
  companyId: string,
  service: ConnectedService,
  message: string,
  client?: DbClient,
  accountId?: string
): Promise<void> {
  await updateAccount(companyId, service, {
    status: 'error',
    last_error: message.slice(0, 500),
  }, client, accountId)
}
