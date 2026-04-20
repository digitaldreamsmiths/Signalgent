/**
 * GA4-specific token handling.
 *
 * Mirrors `lib/integrations/gmail/tokens.ts` — save-side is shaped to the
 * product (GA stores a property resource name + display name), load-side
 * delegates to the shared Google loader.
 *
 * The `account_identifier` column stores the full GA4 property resource
 * name (e.g. `properties/123456789`) — that's the exact shape the Data
 * API expects, so no reformatting needed on the way back out. The
 * `account_label` column stores the human-readable display name for the
 * connection chip.
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

const SERVICE: ConnectedService = 'google_analytics'

export interface GoogleAnalyticsCredentials {
  accessToken: string
  refreshToken: string | null
  /** Unix ms when access_token expires. */
  expiresAt: number
  scope: string | null
  /** `properties/123456789` — full resource name, goes in account_identifier. */
  propertyResourceName: string
  /** Human-readable name (e.g. "My Business GA4"), goes in account_label. */
  propertyDisplayName: string
}

/**
 * Save (or replace) GA4 credentials for a company. Idempotent on
 * (company_id, service).
 */
export async function saveGoogleAnalyticsCredentials(
  companyId: string,
  creds: GoogleAnalyticsCredentials
): Promise<void> {
  await upsertAccount({
    company_id: companyId,
    service: SERVICE,
    access_token: encryptNullable(creds.accessToken),
    refresh_token: encryptNullable(creds.refreshToken),
    token_expires_at: new Date(creds.expiresAt).toISOString(),
    account_identifier: creds.propertyResourceName,
    account_label: creds.propertyDisplayName,
    scope: creds.scope,
    scopes: creds.scope ? creds.scope.split(/[\s,]+/).filter(Boolean) : null,
    status: 'connected',
    last_error: null,
  })
}

/**
 * Load a decrypted, guaranteed-fresh access token for GA4. Returns null
 * when the account is missing, disconnected, or the refresh flow fails.
 */
export async function loadGoogleAnalyticsCredentials(
  companyId: string
): Promise<{ accessToken: string; propertyResourceName: string } | null> {
  const creds = await loadGoogleCredentials(companyId, SERVICE)
  if (!creds) return null
  return {
    accessToken: creds.accessToken,
    propertyResourceName: creds.accountIdentifier,
  }
}

/**
 * Load the raw refresh token, plaintext. Only used by the disconnect
 * flow so we can revoke at Google before deleting our copy.
 */
export async function loadGoogleAnalyticsRefreshToken(
  companyId: string
): Promise<string | null> {
  return loadGoogleRefreshToken(companyId, SERVICE)
}

/** Full row for UI (status popover, etc.) — tokens NOT decrypted. */
export async function getGoogleAnalyticsAccountRow(
  companyId: string
): Promise<ConnectedAccount | null> {
  return getAccount(companyId, SERVICE)
}

export async function markGoogleAnalyticsDisconnected(
  companyId: string
): Promise<void> {
  await markAccountDisconnected(companyId, SERVICE)
}

export async function markGoogleAnalyticsError(
  companyId: string,
  message: string
): Promise<void> {
  await markError(companyId, SERVICE, message)
}

export { SERVICE as GOOGLE_ANALYTICS_SERVICE }
