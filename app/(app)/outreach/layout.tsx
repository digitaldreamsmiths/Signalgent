'use client'

import { useCompany } from '@/contexts/company-context'
import { OutreachProvider } from '@/contexts/outreach-context'

/**
 * Hosts the shared workspace data for everything under /outreach. The provider
 * lives here rather than in the page so the section routes (Phase 5 stage 2b)
 * can share one snapshot instead of each re-fetching the whole workspace.
 *
 * Keyed by company so switching workspaces remounts the provider and drops all
 * of its state at once — campaign ids and prospect ids are per-company, and a
 * remount is both simpler and safer than resetting each piece by hand.
 */
export default function OutreachLayout({ children }: { children: React.ReactNode }) {
  const { activeCompany } = useCompany()
  return <OutreachProvider key={activeCompany?.id ?? 'none'}>{children}</OutreachProvider>
}
