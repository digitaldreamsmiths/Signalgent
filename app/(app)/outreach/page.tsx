'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { OutreachWorkspace } from '@/components/widgets/content/outreach-widgets'

export default function OutreachPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('outreach') }, [setMode])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <OutreachWorkspace />
    </div>
  )
}
