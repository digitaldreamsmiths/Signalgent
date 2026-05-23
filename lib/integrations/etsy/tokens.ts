/**
 * Etsy token persistence + transparent refresh.
 *
 * Same shape as the Google loader (`lib/integrations/google/tokens.ts`)
 * but self-contained because Etsy rotates refresh tokens: every refresh
 * returns a NEW refresh token that must replace the old one. The Google
 * helper skips that because Google keeps the original refresh token
 * valid indefinitely.
 *
 * `account_identifier` stores the Etsy shop_id as a string; the Etsy API
 * expects a numeric shop_id in URLs, so the snapshot layer parses back
 * to Number before interpolating.
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

const SERVICE: ConnectedService = 'etsy'
const REFRESH_SKEW_SEC = 60

export interface EtsyCredentialsToSave {
  accessToken: string
  refreshToken: string
  /** Unix ms when access_token expires. */
  expiresAt: number
  /** Etsy shop_id as a string (lives in account_identifier). */
  shopId: string
  /** Human-readable name (e.g. "MyShop"). Goes in account_label. */
  shopName: string
  /** ISO 4217 currency code from the shop (e.g. "USD"). Persisted in metadata. */
  currencyCode: string
  scope?: string | null
}

export interface LoadedEtsyCreds {
  accessToken: string
  shopId: number
  shopName: string | null
  currencyCode: string
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export async function saveEtsyCredentials(
  companyId: string,
  creds: EtsyCredentialsToSave
): Promise<void> {
  await upsertAccount({
    company_id: companyId,
    service: SERVICE,
    access_token: encrypt(creds.accessToken),
    refresh_token: encryptNullable(creds.refreshToken),
    token_expires_at: new Date(creds.expiresAt).toISOString(),
    account_identifier: creds.shopId,
    account_label: creds.shopName,
    scope: creds.scope ?? null,
    scopes: creds.scope ? creds.scope.split(/[\s,]+/).filter(Boolean) : null,
    metadata: { currency_code: creds.currencyCode },
    status: 'connected',
    last_error: null,
  })
}

// ---------------------------------------------------------------------------
// Load (+ transparent refresh)
// ---------------------------------------------------------------------------

export async function loadEtsyCredentials(
  companyId: string
): Promise<LoadedEtsyCreds | null> {
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

  const shopIdNum = Number(row.account_identifier)
  if (!Number.isFinite(shopIdNum)) {
    await markError(companyId, SERVICE, `Invalid shop_id on file: ${row.account_identifier}`)
    return null
  }
  const currencyCode = readCurrencyCode(row.metadata) ?? 'USD'

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  const nowMs = Date.now()
  const stillValid = expiresAt - REFRESH_SKEW_SEC * 1000 > nowMs
  if (stillValid) {
    return {
      accessToken,
      shopId: shopIdNum,
      shopName: row.account_label,
      currencyCode,
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
      // Etsy rotates refresh tokens — persist the new one.
      refresh_token: encrypt(refreshed.refresh_token),
      token_expires_at: new Date(newExpiresAt).toISOString(),
      last_error: null,
      status: 'connected',
    })
    return {
      accessToken: refreshed.access_token,
      shopId: shopIdNum,
      shopName: row.account_label,
      currencyCode,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markError(companyId, SERVICE, `Token refresh failed: ${msg}`)
    return null
  }
}

function readCurrencyCode(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const code = (metadata as Record<string, unknown>).currency_code
  return typeof code === 'string' ? code : null
}

// ---------------------------------------------------------------------------
// Disconnect support
// ---------------------------------------------------------------------------

/**
 * Load the raw refresh token, plaintext. Used only by the disconnect flow.
 * (Etsy has no documented revoke endpoint — we simply drop our copy.)
 */
export async function loadEtsyRefreshToken(companyId: string): Promise<string | null> {
  const row = await getAccount(companyId, SERVICE)
  if (!row?.refresh_token) return null
  try {
    return decryptNullable(row.refresh_token)
  } catch {
    return null
  }
}

export async function getEtsyAccountRow(
  companyId: string
): Promise<ConnectedAccount | null> {
  return getAccount(companyId, SERVICE)
}

export async function markEtsyDisconnected(companyId: string): Promise<void> {
  await markAccountDisconnected(companyId, SERVICE)
}

export async function markEtsyError(companyId: string, message: string): Promise<void> {
  await markError(companyId, SERVICE, message)
}

export { SERVICE as ETSY_SERVICE }
