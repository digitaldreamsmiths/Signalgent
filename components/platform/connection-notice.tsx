'use client'

import { useSearchParams } from 'next/navigation'
import { GMAIL_CONNECTION_ERRORS } from '@/lib/integrations/gmail/connection-errors'

export function ConnectionNotice() {
  const query = useSearchParams()
  if (query.get('integration') !== 'gmail') return null
  if (query.get('status') === 'connected') {
    return <div role="status" className="sg-callout">Gmail connected. Open Inbox to use this mailbox.</div>
  }
  const reason = query.get('reason') ?? ''
  const message = Object.prototype.hasOwnProperty.call(GMAIL_CONNECTION_ERRORS, reason)
    ? GMAIL_CONNECTION_ERRORS[reason as keyof typeof GMAIL_CONNECTION_ERRORS]
    : 'Gmail could not connect. Start a fresh connection attempt from this page.'
  return <div role="alert" className="sg-inline-error">{message}</div>
}
