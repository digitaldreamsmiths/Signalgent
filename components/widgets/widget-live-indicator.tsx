'use client'

/**
 * WidgetLiveIndicator
 *
 * A minimal context a widget's children can read/write to tell the
 * surrounding WidgetShell "I am rendering live data, hide the sample
 * badge." Widgets that don't opt in render as before (badge shown).
 *
 * Usage inside a widget:
 *   const { markLive } = useWidgetLiveIndicator()
 *   useEffect(() => { if (isLive) markLive() }, [isLive])
 *
 * The shell reads `isLive` and conditionally renders the badge.
 *
 * Scope: each WidgetShell instance is its own provider, so one widget's
 * live state doesn't leak to a neighbor.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface WidgetLiveIndicatorValue {
  isLive: boolean
  markLive: () => void
  markMock: () => void
}

const Ctx = createContext<WidgetLiveIndicatorValue | undefined>(undefined)

export function WidgetLiveIndicatorProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false)
  const markLive = useCallback(() => setIsLive(true), [])
  const markMock = useCallback(() => setIsLive(false), [])
  const value = useMemo(() => ({ isLive, markLive, markMock }), [isLive, markLive, markMock])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Returns a no-op shape when called outside a provider so widgets can
 * use it unconditionally without crashing in tests or standalone renders.
 */
export function useWidgetLiveIndicator(): WidgetLiveIndicatorValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    return { isLive: false, markLive: () => {}, markMock: () => {} }
  }
  return ctx
}

/**
 * Shell-only: read isLive without the setters.
 */
export function useIsWidgetLive(): boolean {
  const ctx = useContext(Ctx)
  return ctx?.isLive ?? false
}
