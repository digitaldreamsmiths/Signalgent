'use server'

/**
 * Server actions for integration lifecycle operations.
 *
 * These are called directly from client components (popover buttons, etc.).
 * Every action starts with requireCompanyAccess.
 */

import { revalidatePath } from 'next/cache'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { deauthorize } from '@/lib/integrations/stripe/fetch'
import {
  getStripeAccountRow,
  loadStripeCredentials,
  markStripeDisconnected,
  STRIPE_SERVICE,
} from '@/lib/integrations/stripe/tokens'
import { invalidateFinanceSnapshot } from '@/lib/integrations/stripe/snapshot'
import { revokeToken } from '@/lib/integrations/gmail/fetch'
import {
  getGmailAccountRow,
  loadGmailRefreshToken,
  markGmailDisconnected,
  GMAIL_SERVICE,
} from '@/lib/integrations/gmail/tokens'
import { invalidateCommunicationsSnapshot } from '@/lib/integrations/gmail/snapshot'
import type { ConnectedAccount } from '@/lib/types'
import type { ConnectedService } from '@/lib/integrations/accounts'

export interface ConnectionStatusView {
  service: ConnectedService
  status: ConnectedAccount['status'] | 'not_connected'
  accountLabel: string | null
  connectedAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
}

export async function getStripeStatus(companyId: string): Promise<ConnectionStatusView> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return {
        service: 'stripe_account',
        status: 'not_connected',
        accountLabel: null,
        connectedAt: null,
        lastSyncedAt: null,
        lastError: null,
      }
    }
    throw err
  }

  const row = await getStripeAccountRow(companyId)
  if (!row) {
    return {
      service: 'stripe_account',
      status: 'not_connected',
      accountLabel: null,
      connectedAt: null,
      lastSyncedAt: null,
      lastError: null,
    }
  }
  return {
    service: 'stripe_account',
    status: row.status,
    accountLabel: row.account_label,
    connectedAt: row.created_at,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
  }
}

/**
 * Disconnect flow:
 *   1. Revoke at provider (best effort)
 *   2. Mark row disconnected + null tokens
 *   3. Invalidate cache
 *   4. Revalidate /finance so widgets re-render
 */
export async function disconnectStripe(companyId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return { ok: false, error: err.message }
    }
    throw err
  }

  // Step 1: best-effort provider revoke
  try {
    const creds = await loadStripeCredentials(companyId)
    if (creds?.stripeUserId) {
      await deauthorize(creds.stripeUserId)
    }
  } catch (err) {
    // Proceed with local cleanup regardless.
    console.warn('Stripe deauthorize failed; continuing with local disconnect', err)
  }

  // Steps 2–3: local cleanup
  await markStripeDisconnected(companyId)
  await invalidateFinanceSnapshot(companyId)

  // Step 4: rerender
  revalidatePath('/finance')
  revalidatePath('/dashboard')

  return { ok: true }
}

// ============================================================================
// Gmail
// ============================================================================

export async function getGmailStatus(companyId: string): Promise<ConnectionStatusView> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return {
        service: GMAIL_SERVICE,
        status: 'not_connected',
        accountLabel: null,
        connectedAt: null,
        lastSyncedAt: null,
        lastError: null,
      }
    }
    throw err
  }

  const row = await getGmailAccountRow(companyId)
  if (!row) {
    return {
      service: GMAIL_SERVICE,
      status: 'not_connected',
      accountLabel: null,
      connectedAt: null,
      lastSyncedAt: null,
      lastError: null,
    }
  }
  return {
    service: GMAIL_SERVICE,
    status: row.status,
    accountLabel: row.account_label,
    connectedAt: row.created_at,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
  }
}

/**
 * Gmail disconnect flow:
 *   1. Revoke refresh token at Google (best effort)
 *   2. Mark row disconnected + null tokens
 *   3. Invalidate cache
 *   4. Revalidate /communications so widgets re-render
 */
export async function disconnectGmail(companyId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return { ok: false, error: err.message }
    }
    throw err
  }

  // Step 1: best-effort provider revoke. We revoke the refresh token since
  // that kills both it and any derived access token at Google's end.
  try {
    const refresh = await loadGmailRefreshToken(companyId)
    if (refresh) {
      await revokeToken(refresh)
    }
  } catch (err) {
    console.warn('Gmail revoke failed; continuing with local disconnect', err)
  }

  // Steps 2–3: local cleanup
  await markGmailDisconnected(companyId)
  await invalidateCommunicationsSnapshot(companyId)

  // Step 4: rerender
  revalidatePath('/communications')
  revalidatePath('/dashboard')

  return { ok: true }
}
