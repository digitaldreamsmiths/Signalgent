/**
 * LinkedIn token persistence + load.
 *
 * Key shape difference from Etsy/Google:
 *
 * LinkedIn's OIDC-only flow (`openid profile email`) does NOT issue a
 * refresh token. The access token has a ~60-day lifetime and when it
 * expires the user reconnects. Marketing Developer Platform scopes
 * DO issue refresh tokens, but those scopes are out of scope for v1.
 *
 * Persisted shape:
 *   - access_token  → encrypted Bearer token
 *   - refresh_token → null (member-tier doesn't get one)
 *   - account_identifier → LinkedIn `sub` (stable member URN-ish id)
 *   - account_label → member display name
 *   - metadata.picture_url, metadata.email → surfaced in the chip
 */

import { decryptNullable, encrypt } from '../crypto'
import {
  getAccount,
  upsertAccount,
  markError,
  markDisconnected as markAccountDisconnected,
  type ConnectedService,
} from '../accounts'
import type { ConnectedAccount } from '@/lib/types'

const SERVICE: ConnectedService = 'linkedin'

export interface LinkedInCredentialsToSave {
  accessToken: string
  /** Unix ms when access_token expires. */
  expiresAt: number
  /** Stable LinkedIn member sub from /v2/userinfo. */
  memberSub: string
  /** Human-readable display name. Goes in account_label. */
  displayName: string
  /** Profile picture URL (LinkedIn-hosted). Persisted in metadata. */
  pictureUrl?: string | null
  /** Member email if `email` scope granted. Persisted in metadata. */
  email?: string | null
  scope?: string | null
}

export interface LoadedLinkedInCreds {
  accessToken: string
  memberSub: string
  displayName: string | null
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export async function saveLinkedInCredentials(
  companyId: string,
  creds: LinkedInCredentialsToSave
): Promise<void> {
  await upsertAccount({
    company_id: companyId,
    service: SERVICE,
    access_token: encrypt(creds.accessToken),
    refresh_token: null,
    token_expires_at: new Date(creds.expiresAt).toISOString(),
    account_identifier: creds.memberSub,
    account_label: creds.displayName,
    scope: creds.scope ?? null,
    scopes: creds.scope ? creds.scope.split(/[\s,]+/).filter(Boolean) : null,
    metadata: {
      picture_url: creds.pictureUrl ?? null,
      email: creds.email ?? null,
    },
    status: 'connected',
    last_error: null,
  })
}

// ---------------------------------------------------------------------------
// Load (no refresh — expired tokens require reconnect)
// ---------------------------------------------------------------------------

export async function loadLinkedInCredentials(
  companyId: string
): Promise<LoadedLinkedInCreds | null> {
  const row = await getAccount(companyId, SERVICE)
  if (!row) return null
  if (row.status !== 'connected') return null
  if (!row.access_token) return null
  if (!row.account_identifier) return null

  let accessToken: string | null
  try {
    accessToken = decryptNullable(row.access_token)
  } catch {
    await markError(companyId, SERVICE, 'Token decryption failed')
    return null
  }
  if (!accessToken) return null

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0
  if (expiresAt > 0 && expiresAt < Date.now()) {
    await markError(companyId, SERVICE, 'Access token expired — reconnect required')
    return null
  }

  return {
    accessToken,
    memberSub: row.account_identifier,
    displayName: row.account_label,
  }
}

// ---------------------------------------------------------------------------
// Helpers reused by the actions layer
// ---------------------------------------------------------------------------

export async function getLinkedInAccountRow(
  companyId: string
): Promise<ConnectedAccount | null> {
  return getAccount(companyId, SERVICE)
}

export async function markLinkedInDisconnected(companyId: string): Promise<void> {
  await markAccountDisconnected(companyId, SERVICE)
}

export async function markLinkedInError(companyId: string, message: string): Promise<void> {
  await markError(companyId, SERVICE, message)
}

export { SERVICE as LINKEDIN_SERVICE }
