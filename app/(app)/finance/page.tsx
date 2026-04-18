'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'
import { FinanceSnapshotProvider } from '@/contexts/finance-snapshot-context'
import { StripeConnectionChip } from '@/components/integrations/stripe-connection-chip'

export default function FinancePage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('finance') }, [setMode])
  return (
    <FinanceSnapshotProvider>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 10, gap: 8 }}>
        <StripeConnectionChip />
      </div>
      <WidgetGrid modeId="finance" />
    </FinanceSnapshotProvider>
  )
}
