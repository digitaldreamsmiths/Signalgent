'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Connections', href: '/settings/connections' },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: '#e0e0e0', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
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
                  color: active ? '#e0e0e0' : '#555',
                  background: active ? '#1a1a1a' : 'transparent',
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
