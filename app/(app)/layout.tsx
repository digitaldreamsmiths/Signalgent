'use client'

import { useCallback, useEffect, useState } from 'react'
import { ModeProvider } from '@/contexts/mode-context'
import { CompanyProvider } from '@/contexts/company-context'
import { ConnectedAccountsProvider } from '@/contexts/connected-accounts-context'
import { Topbar } from '@/components/layout/topbar'
import { BottomDock } from '@/components/layout/bottom-dock'
import { CommandPalette } from '@/components/command-palette'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const closePalette = useCallback(() => setCommandPaletteOpen(false), [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ModeProvider>
      <CompanyProvider>
        <ConnectedAccountsProvider>
        <div className="flex h-screen flex-col overflow-hidden" style={{ background: '#0e0e0e' }}>
          <Topbar />
          {/* Accent line */}
          <div
            className="shrink-0"
            style={{
              height: 2,
              background: 'linear-gradient(90deg, transparent 0%, var(--mode-accent, #8B7FF0) 30%, var(--mode-accent, #8B7FF0) 70%, transparent 100%)',
              boxShadow: '0 0 12px 1px color-mix(in oklch, var(--mode-accent, #8B7FF0) 50%, transparent)',
              transition: 'background 300ms ease, box-shadow 300ms ease',
            }}
          />
          {/* Main content */}
          <main className="flex-1 overflow-y-auto" style={{ padding: 20 }}>
            {children}
          </main>
          <BottomDock />
        </div>
        <CommandPalette open={commandPaletteOpen} onClose={closePalette} />
        </ConnectedAccountsProvider>
      </CompanyProvider>
    </ModeProvider>
  )
}
