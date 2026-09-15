import { notFound } from 'next/navigation'
import { WorkspaceShell } from '@/components/platform/shell'
import { PlatformProvider } from '@/components/platform/provider'
import { WorkspacePage } from '@/components/platform/pages'
import { NAV } from '@/lib/platform/types'
import '@/components/platform/workspace.css'
export default async function Preview({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params
  const current = NAV.find(n => n.id === (section?.[0] ?? 'today'))
  if (!current || (section?.length ?? 0) > 1) notFound()
  return <PlatformProvider preview companyId="preview" companyName="Northline Studio"><WorkspaceShell><WorkspacePage section={current.id} /></WorkspaceShell></PlatformProvider>
}
