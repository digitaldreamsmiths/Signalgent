'use client'

/**
 * AnalyticsSnapshotContext
 *
 * Client-side context that loads the normalized AnalyticsSnapshot for the
 * active company by calling the readAnalyticsSnapshot server action. When
 * snapshot is null (no connection, or error), analytics widgets fall back
 * to their mock data.
 *
 * Lives alongside WidgetGrid on the analytics page so that all analytics
 * widgets receive the same snapshot without prop-drilling through the
 * widget map. Same shape as CommunicationsSnapshotContext.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useCompany } from '@/contexts/company-context'
import { readAnalyticsSnapshot } from '@/lib/integrations/analytics/read'
import type { AnalyticsSnapshot } from '@/lib/integrations/analytics/model'

interface AnalyticsSnapshotContextValue {
  snapshot: AnalyticsSnapshot | null
  isLoading: boolean
  isLive: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<AnalyticsSnapshotContextValue | undefined>(undefined)

export function AnalyticsSnapshotProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      const next = await readAnalyticsSnapshot(id)
      setSnapshot(next)
    } catch {
      setSnapshot(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!companyId) {
      setSnapshot(null)
      return
    }
    void load(companyId)
  }, [companyId, load])

  const refresh = useCallback(async () => {
    if (!companyId) return
    await load(companyId)
  }, [companyId, load])

  return (
    <Ctx.Provider value={{ snapshot, isLoading, isLive: snapshot !== null, refresh }}>
      {children}
    </Ctx.Provider>
  )
}

/**
 * Returns the snapshot or null. Widgets check isLive to decide mock vs live.
 * Returns a safe default outside the provider (all widgets get mock).
 */
export function useAnalyticsSnapshot(): AnalyticsSnapshotContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    return {
      snapshot: null,
      isLoading: false,
      isLive: false,
      refresh: async () => {},
    }
  }
  return ctx
}
