'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'
import { CommerceSnapshotProvider } from '@/contexts/commerce-snapshot-context'
import { EtsyConnectionChip } from '@/components/integrations/etsy-connection-chip'

export default function CommercePage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('commerce') }, [setMode])
  return (
    <CommerceSnapshotProvider>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10, gap: 8 }}>
        <EtsyConnectionChip />
      </div>
      <WidgetGrid modeId="commerce" />
    </CommerceSnapshotProvider>
  )
}
