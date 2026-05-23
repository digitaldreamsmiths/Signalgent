'use client'

/**
 * CommerceSnapshotContext
 *
 * Client-side context that loads the normalized CommerceSnapshot for
 * the active company by calling the `readCommerceSnapshot` server
 * action. When snapshot is null (no connection, or error), commerce
 * widgets fall back to their mock data.
 *
 * Same shape as AnalyticsSnapshotContext — kept as a sibling file
 * rather than generalized because the snapshot types are intentionally
 * mode-specific (analytics vs commerce vs finance).
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
import { readCommerceSnapshot } from '@/lib/integrations/commerce/read'
import type { CommerceSnapshot } from '@/lib/integrations/commerce/model'

interface CommerceSnapshotContextValue {
  snapshot: CommerceSnapshot | null
  isLoading: boolean
  isLive: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<CommerceSnapshotContextValue | undefined>(undefined)

export function CommerceSnapshotProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [snapshot, setSnapshot] = useState<CommerceSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      const next = await readCommerceSnapshot(id)
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
 * Returns the snapshot or null. Widgets check isLive to decide mock vs
 * live. Returns a safe default outside the provider (all widgets get
 * mock), so widgets not wrapped by the provider still work.
 */
export function useCommerceSnapshot(): CommerceSnapshotContextValue {
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
