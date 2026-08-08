'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SECTIONS, SECTION_HREF, useOutreach, type Section } from '@/contexts/outreach-context'

const BORDER = 'var(--app-border)'
const ACCENT = '#D85A30'

export { SECTION_HREF }

/**
 * Section rail — Phase 5 stage 2b. Each section is a real route, so views are
 * linkable and the browser's back button works through the workspace.
 *
 * A left rail on desktop, wrapping pills on narrow screens (the app has no
 * sidebar anywhere else, and a fixed rail would eat most of a phone's width).
 */
export function OutreachNav() {
  const pathname = usePathname()
  const { snapshot } = useOutreach()

  /** The badge is what wants attention, not the section's total — "Pipeline
   * 4,933" would be noise. Zero badges are hidden.
   *
   * Server-counted (campaign-scoped) rather than measured from loaded rows:
   * the browser only holds one page now, so a row count would read "100". */
  const badge = (key: Section): number => {
    if (!snapshot) return 0
    switch (key) {
      case 'pipeline': return snapshot.views.review + snapshot.views.needs_review
      case 'inbox': return snapshot.inbox_untriaged
      case 'schedule': return snapshot.counts.queued
      case 'contacts': return snapshot.views.contacts
    }
  }

  return (
    <nav className="outreach-nav">
      {SECTIONS.map((s) => {
        const href = SECTION_HREF[s.key]
        const on = pathname === href || pathname.startsWith(href + '/')
        const n = badge(s.key)
        return (
          <Link
            key={s.key}
            href={href}
            className="outreach-nav-item"
            style={{
              color: on ? '#fff' : 'var(--app-text-2)',
              background: on ? ACCENT : 'transparent',
              border: `1px solid ${on ? ACCENT : BORDER}`,
            }}
          >
            <span>{s.label}</span>
            {n > 0 && <span style={{ opacity: on ? 0.85 : 0.7 }}>{n.toLocaleString('en-US')}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
