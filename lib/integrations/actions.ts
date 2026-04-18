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
import type { ConnectedAccount } from '@/lib/types'

export interface ConnectionStatusView {
  service: 'stripe_account'
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
