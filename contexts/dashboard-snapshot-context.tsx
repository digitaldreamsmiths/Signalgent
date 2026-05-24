'use client'

/**
 * DashboardSnapshotContext
 *
 * Client-side context that loads the cross-cutting DashboardSnapshot
 * for the active company. Same shape as the mode-specific contexts —
 * a load-on-mount + refresh helper — but the snapshot aggregates a
 * headline from each connected provider rather than belonging to a
 * single mode.
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
import { readDashboardSnapshot } from '@/lib/integrations/dashboard/read'
import type { DashboardSnapshot } from '@/lib/integrations/dashboard/model'

interface DashboardSnapshotContextValue {
  snapshot: DashboardSnapshot | null
  isLoading: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<DashboardSnapshotContextValue | undefined>(undefined)

export function DashboardSnapshotProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      const next = await readDashboardSnapshot(id)
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
    <Ctx.Provider value={{ snapshot, isLoading, refresh }}>
      {children}
    </Ctx.Provider>
  )
}

export function useDashboardSnapshot(): DashboardSnapshotContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    return {
      snapshot: null,
      isLoading: false,
      refresh: async () => {},
    }
  }
  return ctx
}
