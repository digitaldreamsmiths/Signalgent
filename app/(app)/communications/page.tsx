'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'
import { CommunicationsSnapshotProvider } from '@/contexts/communications-snapshot-context'
import { GmailConnectionChip } from '@/components/integrations/gmail-connection-chip'

export default function CommunicationsPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('communications') }, [setMode])
  return (
    <CommunicationsSnapshotProvider>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10, gap: 8 }}>
        <GmailConnectionChip />
      </div>
      <WidgetGrid modeId="communications" />
    </CommunicationsSnapshotProvider>
  )
}
