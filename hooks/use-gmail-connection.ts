'use client'

/**
 * Reactive read of the Gmail connection status for a company.
 *
 * Mirrors hooks/use-stripe-connection.ts. See notes there for why connect
 * and disconnect are not exposed as hook methods.
 */

import { useCallback, useEffect, useState } from 'react'
import { getGmailStatus, type ConnectionStatusView } from '@/lib/integrations/actions'

export interface UseGmailConnectionResult {
  status: ConnectionStatusView | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useGmailConnectionStatus(companyId: string | null): UseGmailConnectionResult {
  const [status, setStatus] = useState<ConnectionStatusView | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(companyId))
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const next = await getGmailStatus(id)
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
 * Pure helper: compute the connect URL for Gmail for a given company.
 * Callers use this as an href; the route handles auth + state issuance.
 */
export function getGmailConnectUrl(companyId: string): string {
  const params = new URLSearchParams({ companyId })
  return `/api/integrations/gmail/connect?${params.toString()}`
}
