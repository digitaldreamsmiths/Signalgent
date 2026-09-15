 'use client'
import { ModeProvider } from '@/contexts/mode-context'
import { CompanyProvider, useCompany } from '@/contexts/company-context'
import { ConnectedAccountsProvider } from '@/contexts/connected-accounts-context'
import { CompanySwitcher } from '@/components/layout/company-switcher'
import { PlatformProvider } from './provider'
import { WorkspaceShell } from './shell'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
export function AppWorkspace({ children }: { children: React.ReactNode }) {
  return <ModeProvider><CompanyProvider><ConnectedAccountsProvider><CompanyWorkspace>{children}</CompanyWorkspace></ConnectedAccountsProvider></CompanyProvider></ModeProvider>
}
function CompanyWorkspace({ children }: { children: React.ReactNode }) {
  const { activeCompany, isLoading } = useCompany()
  const router = useRouter()
  if (isLoading) return <div className="sg-workspace sg-loading">Opening your business…</div>
  return <PlatformProvider key={activeCompany?.id ?? 'none'} companyId={activeCompany?.id} companyName={activeCompany?.name}><WorkspaceShell companyControl={<CompanySwitcher />} userControl={<button className="sg-nav-link" onClick={async () => { await createClient().auth.signOut(); router.push('/login'); router.refresh() }}><LogOut size={16} />Sign out</button>}>{children}</WorkspaceShell></PlatformProvider>
}
