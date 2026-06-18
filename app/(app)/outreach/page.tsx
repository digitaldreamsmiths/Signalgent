'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { OutreachWorkspace } from '@/components/widgets/content/outreach-widgets'

export default function OutreachPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('outreach') }, [setMode])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #272727' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff', margin: 0 }}>Outreach</h1>
      </div>
      <div style={{ background: '#1a1a1a', border: '1px solid #272727', borderRadius: 12, padding: 16 }}>
        <OutreachWorkspace />
      </div>
    </div>
  )
}
