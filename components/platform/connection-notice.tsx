'use client'

import { useSearchParams } from 'next/navigation'
import { GMAIL_CONNECTION_ERRORS } from '@/lib/integrations/gmail/connection-errors'
import { CONNECTION_ERRORS } from '@/lib/integrations/connection-errors'
import { providerFor } from '@/lib/platform/connections'

const has = (map: object, key: string) => Object.prototype.hasOwnProperty.call(map, key)

/** Reads the `?integration=&status=&reason=` an OAuth callback lands on and says it in one sentence. */
export function ConnectionNotice() {
  const query = useSearchParams()
  const integration = query.get('integration')
  if (!integration) return null
  const name = providerFor(integration)?.name ?? 'The account'
  if (query.get('status') === 'connected') {
    return <div role="status" className="sg-callout">{name} connected.{integration === 'gmail' ? ' Open Inbox to use this mailbox.' : ''}</div>
  }
  const reason = query.get('reason') ?? ''
  const message = integration === 'gmail' && has(GMAIL_CONNECTION_ERRORS, reason)
    ? GMAIL_CONNECTION_ERRORS[reason as keyof typeof GMAIL_CONNECTION_ERRORS]
    : has(CONNECTION_ERRORS, reason)
      ? CONNECTION_ERRORS[reason as keyof typeof CONNECTION_ERRORS]
      : `${name} could not connect. Start a fresh connection attempt from this page.`
  return <div role="alert" className="sg-inline-error">{message}</div>
}
