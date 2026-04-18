'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'

export default function MarketingPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('marketing') }, [setMode])
  return <WidgetGrid modeId="marketing" />
}
