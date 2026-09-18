/**
 * One redirect target and one vocabulary of reason codes for every OAuth
 * callback. Providers historically put raw error text in `?reason=`; that text
 * is classified here so the Connections page shows a sentence, never an
 * internal message. Gmail has a richer map of its own in gmail/connection-errors.ts.
 */
export const CONNECTION_ERRORS = {
  cancelled: 'The connection was cancelled. Nothing changed.',
  invalid_state: 'This connection attempt expired or could not be verified. Start again from Connections.',
  unauthorized: 'Sign in to the same business account that started this connection, then try again.',
  configuration: 'This integration is not fully configured on the server. Check its credentials in Vercel.',
  exchange: 'The provider could not complete this connection. Start a fresh connection attempt.',
  profile: 'The provider did not return the account details Signalgent needs. Try connecting again.',
  no_shop: 'No shop was found on that account. Open a shop there first, then reconnect.',
  no_property: 'No analytics property was found on that Google account.',
  save: 'The account authorized successfully, but the connection could not be saved. Try again.',
  migration: 'The database needs the workspace update before another account can be added.',
} as const
export type ConnectionReason = keyof typeof CONNECTION_ERRORS

export function connectionReason(raw: string | null | undefined): ConnectionReason {
  const text = (raw ?? '').trim()
  if (Object.prototype.hasOwnProperty.call(CONNECTION_ERRORS, text)) return text as ConnectionReason
  const m = text.toLowerCase()
  if (!m) return 'exchange'
  if (/cancel|access_denied|denied/.test(m)) return 'cancelled'
  if (/state|pkce|missing code/.test(m)) return 'invalid_state'
  if (/user mismatch|unauthori|forbidden|not a member/.test(m)) return 'unauthorized'
  if (/no etsy shop|no shop/.test(m)) return 'no_shop'
  if (/no ga4|propert/.test(m)) return 'no_property'
  if (/client_id|client_secret|oauth_state_secret|encryption_key|not configured/.test(m)) return 'configuration'
  if (/42p10|no unique or exclusion|migration_required/.test(m)) return 'migration'
  if (/upsert|save|db_error|database/.test(m)) return 'save'
  if (/profile|account info|identity/.test(m)) return 'profile'
  return 'exchange'
}

/** `/connections?integration=…&status=…[&reason=code]` on the given origin. */
export function connectionRedirect(origin: string, params: Record<string, string>): URL {
  const url = new URL('/connections', origin)
  url.searchParams.set('integration', params.integration ?? 'unknown')
  url.searchParams.set('status', params.status ?? 'error')
  if (params.status !== 'connected') url.searchParams.set('reason', connectionReason(params.reason))
  return url
}
