'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Company } from '@/lib/types'

const STORAGE_KEY = 'signalgent_active_company_id'

interface CompanyContextValue {
  companies: Company[]
  activeCompany: Company | null
  setActiveCompany: (company: Company) => void
  refreshCompanies: () => Promise<void>
  isLoading: boolean
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined)

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchCompanies = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setCompanies([])
      setIsLoading(false)
      return
    }

    const { data } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: true })

    if (data && data.length > 0) {
      setCompanies(data)
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && data.find((c) => c.id === stored)) {
        setActiveCompanyId(stored)
      } else {
        setActiveCompanyId(data[0].id)
        localStorage.setItem(STORAGE_KEY, data[0].id)
      }
    } else {
      setCompanies([])
      setActiveCompanyId(null)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  const setActiveCompany = useCallback((company: Company) => {
    setActiveCompanyId(company.id)
    localStorage.setItem(STORAGE_KEY, company.id)
  }, [])

  const refreshCompanies = useCallback(async () => {
    await fetchCompanies()
  }, [fetchCompanies])

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null

  return (
    <CompanyContext.Provider
      value={{ companies, activeCompany, setActiveCompany, refreshCompanies, isLoading }}
    >
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const context = useContext(CompanyContext)
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider')
  }
  return context
}
