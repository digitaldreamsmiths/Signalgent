'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'

export default function CommercePage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('commerce') }, [setMode])
  return <WidgetGrid modeId="commerce" />
}
