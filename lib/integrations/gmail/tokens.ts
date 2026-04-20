/**
 * Gmail-specific token handling.
 *
 * Save-side logic stays here (Gmail-shaped `GmailCredentials` with an
 * email address). Load + auto-refresh delegate to the shared
 * `lib/integrations/google/tokens.ts` helpers — GA4 uses the same
 * loader with its own `ConnectedService` constant.
 */

import { encryptNullable } from '../crypto'
import {
  getAccount,
  upsertAccount,
  markError,
  markDisconnected as markAccountDisconnected,
  type ConnectedService,
} from '../accounts'
import {
  loadGoogleCredentials,
  loadGoogleRefreshToken,
} from '../google/tokens'
import type { ConnectedAccount } from '@/lib/types'

const SERVICE: ConnectedService = 'gmail'

export interface GmailCredentials {
  accessToken: string
  refreshToken: string | null
  /** Unix ms when access_token expires. */
  expiresAt: number
  scope: string | null
  emailAddress: string
}

/**
 * Save (or replace) Gmail credentials for a company. Idempotent on
 * (company_id, service).
 */
export async function saveGmailCredentials(
  companyId: string,
  creds: GmailCredentials
): Promise<void> {
  await upsertAccount({
    company_id: companyId,
    service: SERVICE,
    access_token: encryptNullable(creds.accessToken),
    refresh_token: encryptNullable(creds.refreshToken),
    token_expires_at: new Date(creds.expiresAt).toISOString(),
    account_identifier: creds.emailAddress,
    account_label: creds.emailAddress,
    scope: creds.scope,
    scopes: creds.scope ? creds.scope.split(/[\s,]+/).filter(Boolean) : null,
    status: 'connected',
    last_error: null,
  })
}

/**
 * Load a decrypted, guaranteed-fresh Gmail access token. Returns null when
 * the account is missing, disconnected, or the refresh flow fails.
 *
 * Thin wrapper around the shared Google loader — just renames
 * `accountIdentifier` back to `emailAddress` for Gmail callers.
 */
export async function loadGmailCredentials(
  companyId: string
): Promise<{ accessToken: string; emailAddress: string } | null> {
  const creds = await loadGoogleCredentials(companyId, SERVICE)
  if (!creds) return null
  return { accessToken: creds.accessToken, emailAddress: creds.accountIdentifier }
}

/**
 * Load the raw refresh token, plaintext. Only used by the disconnect flow
 * so we can revoke at Google before deleting our copy.
 */
export async function loadGmailRefreshToken(companyId: string): Promise<string | null> {
  return loadGoogleRefreshToken(companyId, SERVICE)
}

/** Full row for UI (status popover, etc.) — tokens NOT decrypted. */
export async function getGmailAccountRow(
  companyId: string
): Promise<ConnectedAccount | null> {
  return getAccount(companyId, SERVICE)
}

export async function markGmailDisconnected(companyId: string): Promise<void> {
  await markAccountDisconnected(companyId, SERVICE)
}

export async function markGmailError(companyId: string, message: string): Promise<void> {
  await markError(companyId, SERVICE, message)
}

export { SERVICE as GMAIL_SERVICE }
