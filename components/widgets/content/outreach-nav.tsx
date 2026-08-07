'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SECTIONS, useOutreach, type Section } from '@/contexts/outreach-context'

const BORDER = 'var(--app-border)'
const ACCENT = '#D85A30'

export const SECTION_HREF: Record<Section, string> = {
  pipeline: '/outreach/pipeline',
  contacts: '/outreach/contacts',
  inbox: '/outreach/inbox',
  schedule: '/outreach/schedule',
}

/**
 * Section rail — Phase 5 stage 2b. Each section is a real route, so views are
 * linkable and the browser's back button works through the workspace.
 *
 * A left rail on desktop, wrapping pills on narrow screens (the app has no
 * sidebar anywhere else, and a fixed rail would eat most of a phone's width).
 */
export function OutreachNav() {
  const pathname = usePathname()
  const { lists, snapshot } = useOutreach()

  /** The badge is what wants attention, not the section's total — "Pipeline
   * 4,933" would be noise. Zero badges are hidden. */
  const badge = (key: Section): number => {
    switch (key) {
      case 'pipeline': return lists.review.length + lists.needs_review.length
      case 'inbox': return lists.replied.filter((p) => p.disposition === 'replied').length
      case 'schedule': return snapshot?.counts.queued ?? 0
      case 'contacts': return lists.contacts.length
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
