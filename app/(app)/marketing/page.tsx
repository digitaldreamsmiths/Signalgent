'use client'

import { useEffect, useState } from 'react'
import { useMode } from '@/contexts/mode-context'
import { WidgetGrid } from '@/components/widgets/widget-grid'
import { MarketingSnapshotProvider } from '@/contexts/marketing-snapshot-context'
import { LinkedInConnectionChip } from '@/components/integrations/linkedin-connection-chip'
import { PinterestConnectionChip } from '@/components/integrations/pinterest-connection-chip'
import { OutreachWorkspace } from '@/components/widgets/content/outreach-widgets'

type Tab = 'overview' | 'outreach'

const ACCENT = '#D85A30'

export default function MarketingPage() {
  const { setMode } = useMode()
  const [tab, setTab] = useState<Tab>('overview')
  useEffect(() => { setMode('marketing') }, [setMode])

  const tabBtn = (key: Tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: tab === key ? ACCENT : '#8a8a8a',
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${tab === key ? ACCENT : 'transparent'}`,
        padding: '8px 12px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <MarketingSnapshotProvider>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, borderBottom: '1px solid #272727' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {tabBtn('overview', 'Overview')}
          {tabBtn('outreach', 'Outreach')}
        </div>
        {tab === 'overview' && (
          <div style={{ display: 'flex', gap: 8, paddingBottom: 6 }}>
            <PinterestConnectionChip />
            <LinkedInConnectionChip />
          </div>
        )}
      </div>

      {tab === 'overview' ? (
        <WidgetGrid modeId="marketing" />
      ) : (
        <div style={{ background: '#1a1a1a', border: '1px solid #272727', borderRadius: 12, padding: 16 }}>
          <OutreachWorkspace />
        </div>
      )}
    </MarketingSnapshotProvider>
  )
}
