'use client'

/**
 * Reactive read of the Stripe connection status for a company.
 *
 * Behavior:
 *   - Fetches once on mount, then re-fetches on companyId change.
 *   - Exposes refresh() so consumers (e.g. the popover after disconnect) can
 *     force an immediate re-read without waiting for a poll tick.
 *   - No action methods: connect() is a navigation to /api/integrations/stripe/connect
 *     and disconnect() is a server action. See notes below.
 *
 * Note on "no connect/disconnect in the hook":
 *   Connect is a browser redirect, not a promise-returning action — encoding it
 *   as a hook method was dishonest about the real flow. Disconnect is a server
 *   action that can be called directly; keeping it out of the hook makes the
 *   component consuming it a simple <form action={disconnectStripe}> or an
 *   onClick that awaits the action. The hook is for status only.
 */

import { useCallback, useEffect, useState } from 'react'
import { getStripeStatus, type ConnectionStatusView } from '@/lib/integrations/actions'

export interface UseConnectionStatusResult {
  status: ConnectionStatusView | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useStripeConnectionStatus(companyId: string | null): UseConnectionStatusResult {
  const [status, setStatus] = useState<ConnectionStatusView | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(companyId))
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const next = await getStripeStatus(id)
      setStatus(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!companyId) {
      setStatus(null)
      setIsLoading(false)
      return
    }
    void load(companyId)
  }, [companyId, load])

  const refresh = useCallback(async () => {
    if (!companyId) return
    await load(companyId)
  }, [companyId, load])

  return { status, isLoading, error, refresh }
}

/**
 * Pure helper: compute the connect URL for Stripe for a given company.
 * Callers use this as an href; the route handles auth + state issuance.
 */
export function getStripeConnectUrl(companyId: string): string {
  const params = new URLSearchParams({ companyId })
  return `/api/integrations/stripe/connect?${params.toString()}`
}
