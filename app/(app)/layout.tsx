import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppWorkspace } from '@/components/platform/app-workspace'
import '@/components/platform/workspace.css'
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect('/login')
  return <AppWorkspace>{children}</AppWorkspace>
}
