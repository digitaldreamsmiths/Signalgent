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
import type {
  ConnectedAccount,
  InsertTables,
  UpdateTables,
} from '@/lib/types'

export type ConnectedService = ConnectedAccount['service']
export type ConnectedStatus = ConnectedAccount['status']

/** Fetch a single account by (companyId, service). Returns null if not found. */
export async function getAccount(
  companyId: string,
  service: ConnectedService
): Promise<ConnectedAccount | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('connected_accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('service', service)
    .maybeSingle()

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
 * Idempotent upsert on (company_id, service). Callers pass already-encrypted
 * token fields. Merges metadata shallowly when the row exists.
 */
export async function upsertAccount(
  row: InsertTables<'connected_accounts'>
): Promise<ConnectedAccount> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('connected_accounts')
    .upsert(row, { onConflict: 'company_id,service' })
    .select('*')
    .single()

  if (error) {
    throw new Error(`upsertAccount failed: ${error.message}`)
  }
  return data
}

/** Patch an existing row by (companyId, service). Returns the updated row. */
export async function updateAccount(
  companyId: string,
  service: ConnectedService,
  patch: UpdateTables<'connected_accounts'>
): Promise<ConnectedAccount | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('connected_accounts')
    .update(patch)
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
  const { error } = await supabase
    .from('connected_accounts')
    .delete()
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
  message: string
): Promise<void> {
  await updateAccount(companyId, service, {
    status: 'error',
    last_error: message.slice(0, 500),
  })
}
