'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompany } from '@/contexts/company-context'
import type { ConnectedAccount } from '@/lib/types'

interface ConnectedAccountsContextValue {
  connectedAccounts: ConnectedAccount[]
  /** True if the given service is connected and active for the current company */
  isConnected: (service: string) => boolean
  /** Returns the full account record if connected */
  getAccount: (service: string) => ConnectedAccount | undefined
  /** Re-fetch from Supabase */
  refresh: () => Promise<void>
  isLoading: boolean
}

const ConnectedAccountsContext = createContext<ConnectedAccountsContextValue>({
  connectedAccounts: [],
  isConnected: () => false,
  getAccount: () => undefined,
  refresh: async () => {},
  isLoading: false,
})

export function ConnectedAccountsProvider({ children }: { children: React.ReactNode }) {
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { activeCompany } = useCompany()
  const supabase = createClient()

  const refresh = useCallback(async () => {
    if (!activeCompany?.id) {
      setConnectedAccounts([])
      return
    }
    setIsLoading(true)
    const { data } = await supabase
      .from('connected_accounts')
      .select('*')
      .eq('company_id', activeCompany.id)
      .eq('status', 'connected')
    setConnectedAccounts(data ?? [])
    setIsLoading(false)
  }, [activeCompany?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh()
  }, [refresh])

  const isConnected = useCallback(
    (service: string) => connectedAccounts.some((a) => a.service === service),
    [connectedAccounts]
  )

  const getAccount = useCallback(
    (service: string) => connectedAccounts.find((a) => a.service === service),
    [connectedAccounts]
  )

  return (
    <ConnectedAccountsContext.Provider
      value={{ connectedAccounts, isConnected, getAccount, refresh, isLoading }}
    >
      {children}
    </ConnectedAccountsContext.Provider>
  )
}

export function useConnectedAccounts() {
  return useContext(ConnectedAccountsContext)
}
