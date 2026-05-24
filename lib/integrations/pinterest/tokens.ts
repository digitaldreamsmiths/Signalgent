/**
 * Pinterest token persistence + transparent refresh.
 *
 * Pinterest rotates refresh tokens on every refresh (same convention
 * as Etsy). Access tokens last ~30 days, refresh tokens last ~1 year.
 *
 * Persisted shape:
 *   - access_token  → encrypted Bearer
 *   - refresh_token → encrypted; replaced on every successful refresh
 *   - account_identifier → Pinterest user account `id`
 *   - account_label → Pinterest username
 *   - metadata.account_type, metadata.profile_image
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

const SERVICE: ConnectedService = 'pinterest'
const REFRESH_SKEW_SEC = 60

export interface PinterestCredentialsToSave {
  accessToken: string
  refreshToken: string
  /** Unix ms when access_token expires. */
  expiresAt: number
  /** Pinterest user account id (stable). */
  accountId: string
  /** Username (without leading @). */
  username: string
  accountType?: string | null
  profileImage?: string | null
  scope?: string | null
}

export interface LoadedPinterestCreds {
  accessToken: string
  accountId: string
  username: string | null
}

export async function savePinterestCredentials(
  companyId: string,
  creds: PinterestCredentialsToSave
): Promise<void> {
  await upsertAccount({
    company_id: companyId,
    service: SERVICE,
    access_token: encrypt(creds.accessToken),
    refresh_token: encryptNullable(creds.refreshToken),
    token_expires_at: new Date(creds.expiresAt).toISOString(),
    account_identifier: creds.accountId,
    account_label: creds.username,
    scope: creds.scope ?? null,
    scopes: creds.scope ? creds.scope.split(/[\s,]+/).filter(Boolean) : null,
    metadata: {
      account_type: creds.accountType ?? null,
      profile_image: creds.profileImage ?? null,
    },
    status: 'connected',
    last_error: null,
  })
}

export async function loadPinterestCredentials(
  companyId: string
): Promise<LoadedPinterestCreds | null> {
  const row = await getAccount(companyId, SERVICE)
  if (!row) return null
  if (row.status !== 'connected') return null
  if (!row.access_token) return null
  if (!row.account_identifier) return null

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

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  const nowMs = Date.now()
  const stillValid = expiresAt - REFRESH_SKEW_SEC * 1000 > nowMs
  if (stillValid) {
    return {
      accessToken,
      accountId: row.account_identifier,
      username: row.account_label,
    }
  }

  if (!refreshToken) {
    await markError(companyId, SERVICE, 'Access token expired and no refresh token on file')
    return null
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken)
    const newExpiresAt = nowMs + refreshed.expires_in * 1000
    await updateAccount(companyId, SERVICE, {
      access_token: encrypt(refreshed.access_token),
      refresh_token: encrypt(refreshed.refresh_token),
      token_expires_at: new Date(newExpiresAt).toISOString(),
      last_error: null,
      status: 'connected',
    })
    return {
      accessToken: refreshed.access_token,
      accountId: row.account_identifier,
      username: row.account_label,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markError(companyId, SERVICE, `Token refresh failed: ${msg}`)
    return null
  }
}

export async function getPinterestAccountRow(
  companyId: string
): Promise<ConnectedAccount | null> {
  return getAccount(companyId, SERVICE)
}

export async function markPinterestDisconnected(companyId: string): Promise<void> {
  await markAccountDisconnected(companyId, SERVICE)
}

export async function markPinterestError(companyId: string, message: string): Promise<void> {
  await markError(companyId, SERVICE, message)
}

export { SERVICE as PINTEREST_SERVICE }
