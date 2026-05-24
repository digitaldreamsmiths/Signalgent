'use client'

/**
 * MarketingSnapshotContext
 *
 * Client-side context that loads the MarketingSnapshot (Pinterest) for
 * the active company. Same shape as the four mode-specific contexts
 * that already exist.
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
import { readMarketingSnapshot } from '@/lib/integrations/marketing/read'
import type { MarketingSnapshot } from '@/lib/integrations/marketing/model'

interface MarketingSnapshotContextValue {
  snapshot: MarketingSnapshot | null
  isLoading: boolean
  isLive: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<MarketingSnapshotContextValue | undefined>(undefined)

export function MarketingSnapshotProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [snapshot, setSnapshot] = useState<MarketingSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      const next = await readMarketingSnapshot(id)
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

export function useMarketingSnapshot(): MarketingSnapshotContextValue {
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
