'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'
import { AnalyticsSnapshotProvider } from '@/contexts/analytics-snapshot-context'
import { GoogleAnalyticsConnectionChip } from '@/components/integrations/google-analytics-connection-chip'

export default function AnalyticsPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('analytics') }, [setMode])
  return (
    <AnalyticsSnapshotProvider>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10, gap: 8 }}>
        <GoogleAnalyticsConnectionChip />
      </div>
      <WidgetGrid modeId="analytics" />
    </AnalyticsSnapshotProvider>
  )
}
