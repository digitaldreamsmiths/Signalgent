'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMode, MODES, type ModeId } from '@/contexts/mode-context'

function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="7" height="7" rx="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function MarketingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <polygon points="2,4 8,10 2,16" />
      <rect x="10" y="6" width="8" height="1.5" rx="0.75" />
      <rect x="10" y="9.25" width="8" height="1.5" rx="0.75" />
      <rect x="10" y="12.5" width="8" height="1.5" rx="0.75" />
    </svg>
  )
}

function CommunicationsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="16" height="12" rx="2" />
      <path d="M2 6l8 5 8-5" />
    </svg>
  )
}

function FinanceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <rect x="3" y="10" width="3.5" height="7" rx="1" />
      <rect x="8.25" y="6" width="3.5" height="11" rx="1" />
      <rect x="13.5" y="3" width="3.5" height="14" rx="1" />
    </svg>
  )
}

function CommerceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 4h1.5l2 9h8l2-6H7" />
      <circle cx="8.5" cy="16" r="1.25" />
      <circle cx="14.5" cy="16" r="1.25" />
    </svg>
  )
}

function AnalyticsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="2" y1="17" x2="18" y2="17" />
      <polyline points="3,14 7,8 11,11 15,4 18,6" strokeLinejoin="round" />
    </svg>
  )
}

const DOCK_ITEMS: { mode: ModeId; icon: () => React.ReactNode }[] = [
  { mode: 'dashboard', icon: DashboardIcon },
  { mode: 'marketing', icon: MarketingIcon },
  { mode: 'communications', icon: CommunicationsIcon },
  { mode: 'finance', icon: FinanceIcon },
  { mode: 'commerce', icon: CommerceIcon },
  { mode: 'analytics', icon: AnalyticsIcon },
]

export function BottomDock() {
  const pathname = usePathname()
  const { setMode } = useMode()

  return (
    <nav
      className="dock-glass flex shrink-0 items-center justify-around"
      style={{
        height: 64,
      }}
    >
      {DOCK_ITEMS.map(({ mode, icon: Icon }) => {
        const m = MODES[mode]
        const isActive = pathname.startsWith(m.href)

        return (
          <Link
            key={mode}
            href={m.href}
            onClick={() => setMode(mode)}
            className="flex flex-col items-center gap-1 transition-colors duration-200"
            style={{
              padding: '6px 20px',
              borderRadius: 10,
              color: isActive ? m.accent : '#666',
              background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
            }}
          >
            <Icon />
            <span
              style={{
                fontSize: 10,
                color: isActive ? m.accent : '#555',
              }}
            >
              {m.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
