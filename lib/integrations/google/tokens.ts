/**
 * Shared Google token management.
 *
 * Load + auto-refresh + save for any service that talks to Google over
 * OAuth (Gmail today, Google Analytics as of Session 10). Product-specific
 * token modules are thin wrappers around these primitives — they pass
 * their own `ConnectedService` constant and decide what to store in the
 * `account_identifier` / `account_label` / `metadata` columns.
 *
 * Refresh is the key difference from Stripe: Google access tokens expire
 * in ~1h. We check `token_expires_at` on every load and transparently
 * refresh when it's within REFRESH_SKEW_SEC of expiry, saving the new
 * access token back to the DB.
 */

import { decryptNullable, encrypt } from '../crypto'
import {
  getAccount,
  updateAccount,
  markError,
  type ConnectedService,
} from '../accounts'
import { refreshAccessToken } from './fetch'

/** Refresh when the access token has this many seconds or less to live. */
const REFRESH_SKEW_SEC = 60

export interface LoadedGoogleCreds {
  accessToken: string
  /**
   * Whatever the product used as its account identifier — Gmail stores
   * the mailbox email here, GA stores the property ID (`properties/123`).
   */
  accountIdentifier: string
}

/**
 * Load a decrypted, guaranteed-fresh Google access token for a given
 * service. Returns null when the account is missing, disconnected, can't
 * decrypt, or the refresh flow fails.
 *
 * Behaviour:
 *   1. Read row + decrypt access_token + refresh_token.
 *   2. If token_expires_at is in the future (minus skew), return as-is.
 *   3. Otherwise call Google to refresh, persist the new access token,
 *      and return the new one.
 *
 * Non-connected statuses (`error`, `disconnected`, `expired`, `revoked`)
 * all short-circuit to null so callers don't have to branch.
 */
export async function loadGoogleCredentials(
  companyId: string,
  service: ConnectedService
): Promise<LoadedGoogleCreds | null> {
  const row = await getAccount(companyId, service)
  if (!row) return null
  if (row.status !== 'connected') return null
  if (!row.access_token) return null

  let accessToken: string | null
  let refreshToken: string | null
  try {
    accessToken = decryptNullable(row.access_token)
    refreshToken = decryptNullable(row.refresh_token)
  } catch {
    await markError(companyId, service, 'Token decryption failed')
    return null
  }
  if (!accessToken) return null

  const accountIdentifier = row.account_identifier ?? row.account_label ?? 'unknown'
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  const nowMs = Date.now()
  const stillValid = expiresAt - REFRESH_SKEW_SEC * 1000 > nowMs

  if (stillValid) {
    return { accessToken, accountIdentifier }
  }

  // Need to refresh. Without a refresh token we cannot recover — mark the
  // row so the UI can prompt reconnect.
  if (!refreshToken) {
    await markError(companyId, service, 'Access token expired and no refresh token on file')
    return null
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken)
    const newExpiresAt = nowMs + refreshed.expires_in * 1000
    await updateAccount(companyId, service, {
      access_token: encrypt(refreshed.access_token),
      token_expires_at: new Date(newExpiresAt).toISOString(),
      scope: refreshed.scope ?? row.scope,
      last_error: null,
      status: 'connected',
    })
    return { accessToken: refreshed.access_token, accountIdentifier }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markError(companyId, service, `Token refresh failed: ${msg}`)
    return null
  }
}

/**
 * Load the raw refresh token, plaintext. Only used by disconnect flows
 * so we can revoke at Google before deleting our copy.
 */
export async function loadGoogleRefreshToken(
  companyId: string,
  service: ConnectedService
): Promise<string | null> {
  const row = await getAccount(companyId, service)
  if (!row?.refresh_token) return null
  try {
    return decryptNullable(row.refresh_token)
  } catch {
    return null
  }
}
