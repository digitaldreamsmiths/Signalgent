'use client'

import { useEffect } from 'react'
import { useMode } from '@/contexts/mode-context'
import { OutreachWorkspace } from '@/components/widgets/content/outreach-widgets'

export default function ContactsPage() {
  const { setMode } = useMode()
  useEffect(() => { setMode('outreach') }, [setMode])

  return <OutreachWorkspace section="contacts" />
}
