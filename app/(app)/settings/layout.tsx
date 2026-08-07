'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Connections', href: '/settings/connections' },
  { label: 'Offer profile', href: '/settings/offer' },
  { label: 'Plan & usage', href: '/settings/plan' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        {/* Theme vars, not fixed hex: these were dark-only, which left the
            heading near-invisible on a light background. */}
        <Link
          href="/outreach"
          style={{ display: 'inline-block', fontSize: 12, color: 'var(--app-muted)', textDecoration: 'none', marginBottom: 10 }}
        >
          ← Back to Outreach
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--app-text)', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 12, color: 'var(--app-muted)', marginTop: 4 }}>
          Manage your integrations, workspace, and preferences
        </p>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Sidebar nav */}
        <nav style={{ width: 140, flexShrink: 0 }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'block',
                  padding: '6px 10px',
                  fontSize: 12,
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: active ? 'var(--app-text)' : 'var(--app-muted)',
                  background: active ? 'var(--app-card)' : 'transparent',
                  marginBottom: 2,
                  transition: 'color 150ms, background 150ms',
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
