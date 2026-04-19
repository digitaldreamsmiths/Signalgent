/**
 * Gmail-specific token handling.
 *
 * Bridges lib/integrations/accounts (dumb DB), lib/integrations/crypto
 * (dumb encryption), and lib/integrations/gmail/fetch (Google token
 * refresh). Callers interact here in plaintext terms and get a
 * guaranteed-fresh access token back from loadGmailCredentials.
 *
 * Refresh is the key difference from Stripe: Google access tokens expire
 * in ~1h. We check `token_expires_at` on every load and transparently
 * refresh when it's within REFRESH_SKEW_SEC of expiry, saving the new
 * access token back to the DB.
 */

import { decryptNullable, encrypt, encryptNullable } from '../crypto'
import {
  getAccount,
  upsertAccount,
  updateAccount,
  markError,
  markDisconnected as markAccountDisconnected,
  type ConnectedService,
} from '../accounts'
import { refreshAccessToken } from './fetch'
import type { ConnectedAccount } from '@/lib/types'

const SERVICE: ConnectedService = 'gmail'

/** Refresh when the access token has this many seconds or less to live. */
const REFRESH_SKEW_SEC = 60

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
 * Behavior:
 *   1. Read row + decrypt access_token + refresh_token.
 *   2. If token_expires_at is in the future (minus skew), return as-is.
 *   3. Otherwise call Google to refresh, persist the new access token,
 *      and return the new one.
 */
export async function loadGmailCredentials(
  companyId: string
): Promise<{ accessToken: string; emailAddress: string } | null> {
  const row = await getAccount(companyId, SERVICE)
  if (!row) return null
  if (row.status !== 'connected') return null
  if (!row.access_token) return null

  let accessToken: string | null
  let refreshToken: string | null
  try {
    accessToken = decryptNullable(row.access_token)
    refreshToken = decryptNullable(row.refresh_token)
  } catch {
    await markError(companyId, SERVICE, 'Token decryption failed')
    return null
  }
  if (!accessToken) return null

  const emailAddress = row.account_identifier ?? row.account_label ?? 'unknown'
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  const nowMs = Date.now()
  const stillValid = expiresAt - REFRESH_SKEW_SEC * 1000 > nowMs

  if (stillValid) {
    return { accessToken, emailAddress }
  }

  // Need to refresh. Without a refresh token we cannot recover — mark the
  // row so the UI can prompt reconnect.
  if (!refreshToken) {
    await markError(companyId, SERVICE, 'Access token expired and no refresh token on file')
    return null
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken)
    const newExpiresAt = nowMs + refreshed.expires_in * 1000
    await updateAccount(companyId, SERVICE, {
      access_token: encrypt(refreshed.access_token),
      token_expires_at: new Date(newExpiresAt).toISOString(),
      scope: refreshed.scope ?? row.scope,
      last_error: null,
      status: 'connected',
    })
    return { accessToken: refreshed.access_token, emailAddress }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markError(companyId, SERVICE, `Token refresh failed: ${msg}`)
    return null
  }
}

/**
 * Load the raw refresh token, plaintext. Only used by the disconnect flow
 * so we can revoke at Google before deleting our copy.
 */
export async function loadGmailRefreshToken(companyId: string): Promise<string | null> {
  const row = await getAccount(companyId, SERVICE)
  if (!row?.refresh_token) return null
  try {
    return decryptNullable(row.refresh_token)
  } catch {
    return null
  }
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
