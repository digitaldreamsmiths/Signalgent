'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function getDateString(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DashboardPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('dashboard') }, [setMode])
  return (
    <>
      <div style={{ paddingBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: '#ffffff' }}>
          {getGreeting()}.
        </h1>
        <p style={{ fontSize: 11, color: '#666666', marginTop: 2 }}>
          {getDateString()}
        </p>
      </div>
      <WidgetGrid modeId="dashboard" />
    </>
  )
}
