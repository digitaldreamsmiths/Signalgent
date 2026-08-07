'use client'

import { useCompany } from '@/contexts/company-context'
import { OutreachProvider } from '@/contexts/outreach-context'
import { OutreachNav } from '@/components/widgets/content/outreach-nav'
import { OutreachChrome } from '@/components/widgets/content/outreach-chrome'

/**
 * Hosts the shared workspace data for everything under /outreach, plus the
 * section rail. The provider lives here rather than in the page so navigating
 * between sections reuses one snapshot instead of re-fetching the workspace.
 *
 * Keyed by company so switching workspaces remounts the provider and drops all
 * of its state at once — campaign ids and prospect ids are per-company, and a
 * remount is both simpler and safer than resetting each piece by hand.
 */
export default function OutreachLayout({ children }: { children: React.ReactNode }) {
  const { activeCompany } = useCompany()
  return (
    <OutreachProvider key={activeCompany?.id ?? 'none'}>
      {/* Inline styles can't express media queries. The rail sits on the left
          on desktop and becomes wrapping pills on narrow screens — a fixed rail
          would eat most of a phone's width. */}
      <style>{`
        .outreach-shell { display: flex; gap: 16px; height: 100%; min-height: 0; }
        .outreach-nav { display: flex; flex-direction: column; gap: 4px; width: 150px; flex-shrink: 0; }
        .outreach-nav-item {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          font-size: 12px; font-weight: 600; border-radius: 8px; padding: 7px 12px;
          text-decoration: none; transition: background 150ms, color 150ms;
        }
        .outreach-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
        @media (max-width: 700px) {
          .outreach-shell { flex-direction: column; height: auto; }
          .outreach-nav { flex-direction: row; flex-wrap: wrap; width: auto; }
          .outreach-nav-item { border-radius: 999px; }
        }
      `}</style>
      <OutreachChrome>
        <div className="outreach-shell">
          <OutreachNav />
          <div className="outreach-main">{children}</div>
        </div>
      </OutreachChrome>
    </OutreachProvider>
  )
}
