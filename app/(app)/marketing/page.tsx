'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'
import { MarketingSnapshotProvider } from '@/contexts/marketing-snapshot-context'
import { LinkedInConnectionChip } from '@/components/integrations/linkedin-connection-chip'
import { PinterestConnectionChip } from '@/components/integrations/pinterest-connection-chip'

export default function MarketingPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('marketing') }, [setMode])
  return (
    <MarketingSnapshotProvider>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10, gap: 8 }}>
        <PinterestConnectionChip />
        <LinkedInConnectionChip />
      </div>
      <WidgetGrid modeId="marketing" />
    </MarketingSnapshotProvider>
  )
}
