'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'

export default function AnalyticsPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('analytics') }, [setMode])
  return <WidgetGrid modeId="analytics" />
}
