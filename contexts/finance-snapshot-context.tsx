'use client'

/**
 * FinanceSnapshotContext
 *
 * Client-side context that loads the normalized FinanceSnapshot for the
 * active company by calling the readFinanceSnapshot server action. When
 * snapshot is null (no connection, or error), finance widgets fall back
 * to their mock data.
 *
 * Lives alongside WidgetGrid on the finance page so that all finance
 * widgets receive the same snapshot without prop-drilling through the
 * widget map.
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
import { readFinanceSnapshot } from '@/lib/integrations/finance/read'
import type { FinanceSnapshot } from '@/lib/integrations/finance/model'

interface FinanceSnapshotContextValue {
  snapshot: FinanceSnapshot | null
  isLoading: boolean
  isLive: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<FinanceSnapshotContextValue | undefined>(undefined)

export function FinanceSnapshotProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      const next = await readFinanceSnapshot(id)
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
export function useFinanceSnapshot(): FinanceSnapshotContextValue {
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
