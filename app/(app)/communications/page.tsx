'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'

export default function CommunicationsPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('communications') }, [setMode])
  return <WidgetGrid modeId="communications" />
}
