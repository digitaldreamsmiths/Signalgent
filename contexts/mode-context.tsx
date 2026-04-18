'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { MODES, type ModeId, type ModeConfig } from '@/lib/modes'

interface ModeContextValue {
  mode: ModeId
  setMode: (mode: ModeId) => void
  config: ModeConfig
}

const ModeContext = createContext<ModeContextValue | undefined>(undefined)

function injectModeVars(modeId: ModeId) {
  const m = MODES[modeId]
  const el = document.documentElement
  el.style.setProperty('--mode-accent', m.accent)
  el.style.setProperty('--mode-accent-text', m.accentText)
  el.style.setProperty('--mode-card-border', m.cardBorder)
  el.style.setProperty('--mode-card-bg', m.cardBg)
  el.style.setProperty('--mode-muted-text', m.mutedText)
  el.style.setProperty('--mode-subtle-text', m.subtleText)
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ModeId>('dashboard')

  const setMode = useCallback((newMode: ModeId) => {
    setModeState(newMode)
    injectModeVars(newMode)
  }, [])

  useEffect(() => {
    injectModeVars(mode)
  }, [mode])

  return (
    <ModeContext.Provider value={{ mode, setMode, config: MODES[mode] }}>
      {children}
    </ModeContext.Provider>
  )
}

export function useMode() {
  const context = useContext(ModeContext)
  if (!context) {
    throw new Error('useMode must be used within a ModeProvider')
  }
  return context
}

export { MODES, type ModeId, type ModeConfig }
