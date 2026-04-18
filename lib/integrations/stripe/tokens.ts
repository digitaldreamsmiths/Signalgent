/**
 * Stripe-specific token handling.
 *
 * Bridges lib/integrations/accounts (dumb DB) and lib/integrations/crypto
 * (dumb encryption). Callers interact here in plaintext terms.
 */

import { decryptNullable, encryptNullable } from '../crypto'
import {
  getAccount,
  upsertAccount,
  markError,
  markDisconnected as markAccountDisconnected,
  type ConnectedService,
} from '../accounts'
import type { ConnectedAccount } from '@/lib/types'

const SERVICE: ConnectedService = 'stripe_account'

export interface StripeCredentials {
  accessToken: string
  refreshToken: string | null
  stripeUserId: string // e.g. "acct_xxx"
  scope: string | null
  accountLabel: string | null
}

/**
 * Save (or replace) Stripe credentials for a company. Idempotent on
 * (company_id, service).
 */
export async function saveStripeCredentials(
  companyId: string,
  creds: StripeCredentials
): Promise<void> {
  await upsertAccount({
    company_id: companyId,
    service: SERVICE,
    access_token: encryptNullable(creds.accessToken),
    refresh_token: encryptNullable(creds.refreshToken),
    provider_account_id: creds.stripeUserId,
    account_identifier: creds.stripeUserId,
    account_label: creds.accountLabel,
    scope: creds.scope,
    scopes: creds.scope ? creds.scope.split(/[\s,]+/).filter(Boolean) : null,
    status: 'connected',
    last_error: null,
  })
}

/**
 * Load plaintext Stripe credentials. Returns null when the account does
 * not exist or is in a non-connected status.
 */
export async function loadStripeCredentials(
  companyId: string
): Promise<{ accessToken: string; stripeUserId: string } | null> {
  const row = await getAccount(companyId, SERVICE)
  if (!row) return null
  if (row.status !== 'connected') return null
  if (!row.access_token || !row.provider_account_id) return null

  try {
    const accessToken = decryptNullable(row.access_token)
    if (!accessToken) return null
    return { accessToken, stripeUserId: row.provider_account_id }
  } catch {
    // Key rotation or corruption. Flag the row and bail.
    await markError(companyId, SERVICE, 'Token decryption failed')
    return null
  }
}

/** Full row for UI (status popover, etc.) — tokens NOT decrypted. */
export async function getStripeAccountRow(
  companyId: string
): Promise<ConnectedAccount | null> {
  return getAccount(companyId, SERVICE)
}

export async function markStripeDisconnected(companyId: string): Promise<void> {
  await markAccountDisconnected(companyId, SERVICE)
}

export async function markStripeError(companyId: string, message: string): Promise<void> {
  await markError(companyId, SERVICE, message)
}

export { SERVICE as STRIPE_SERVICE }
