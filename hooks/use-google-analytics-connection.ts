'use client'

/**
 * Reactive read of the Google Analytics connection status for a company.
 *
 * Mirrors hooks/use-gmail-connection.ts. See notes there for why connect
 * and disconnect are not exposed as hook methods.
 */

import { useCallback, useEffect, useState } from 'react'
import { getGoogleAnalyticsStatus, type ConnectionStatusView } from '@/lib/integrations/actions'

export interface UseGoogleAnalyticsConnectionResult {
  status: ConnectionStatusView | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useGoogleAnalyticsConnectionStatus(
  companyId: string | null
): UseGoogleAnalyticsConnectionResult {
  const [status, setStatus] = useState<ConnectionStatusView | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(companyId))
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const next = await getGoogleAnalyticsStatus(id)
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
 * Pure helper: compute the connect URL for GA4 for a given company.
 * Callers use this as an href; the route handles auth + state issuance.
 */
export function getGoogleAnalyticsConnectUrl(companyId: string): string {
  const params = new URLSearchParams({ companyId })
  return `/api/integrations/google_analytics/connect?${params.toString()}`
}
