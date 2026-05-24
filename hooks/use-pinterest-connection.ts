'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPinterestStatus, type ConnectionStatusView } from '@/lib/integrations/actions'

export interface UsePinterestConnectionResult {
  status: ConnectionStatusView | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function usePinterestConnectionStatus(
  companyId: string | null
): UsePinterestConnectionResult {
  const [status, setStatus] = useState<ConnectionStatusView | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(companyId))
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const next = await getPinterestStatus(id)
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

export function getPinterestConnectUrl(companyId: string): string {
  const params = new URLSearchParams({ companyId })
  return `/api/integrations/pinterest/connect?${params.toString()}`
}
