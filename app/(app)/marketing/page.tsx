'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'
import { LinkedInConnectionChip } from '@/components/integrations/linkedin-connection-chip'

export default function MarketingPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('marketing') }, [setMode])
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10, gap: 8 }}>
        <LinkedInConnectionChip />
      </div>
      <WidgetGrid modeId="marketing" />
    </>
  )
}
