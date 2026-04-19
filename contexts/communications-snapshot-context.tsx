'use client'

/**
 * CommunicationsSnapshotContext
 *
 * Client-side context that loads the normalized CommunicationsSnapshot
 * for the active company by calling the readCommunicationsSnapshot
 * server action. When snapshot is null (no connection, or error),
 * communications widgets fall back to their mock data.
 *
 * Lives alongside WidgetGrid on the communications page so that all
 * communications widgets receive the same snapshot without prop-drilling
 * through the widget map.
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
import { readCommunicationsSnapshot } from '@/lib/integrations/comms/read'
import type { CommunicationsSnapshot } from '@/lib/integrations/comms/model'

interface CommunicationsSnapshotContextValue {
  snapshot: CommunicationsSnapshot | null
  isLoading: boolean
  isLive: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<CommunicationsSnapshotContextValue | undefined>(undefined)

export function CommunicationsSnapshotProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [snapshot, setSnapshot] = useState<CommunicationsSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      const next = await readCommunicationsSnapshot(id)
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
export function useCommunicationsSnapshot(): CommunicationsSnapshotContextValue {
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
