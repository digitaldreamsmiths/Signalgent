import type { ChannelAccount } from './types'

export type ProviderGroup = 'email' | 'social' | 'other'
export interface Provider {
  id: string; name: string; short: string; color: string
  description: string; capability: string
  /** Connect route, or '' when the provider cannot be connected yet. */
  path: string
  /** More than one account per company (mailboxes). Default: one. */
  multi?: boolean
  group: ProviderGroup
}

/**
 * Every provider the Connections page can show. `other` providers were
 * connected by the earlier dashboard; they appear only when the company still
 * has an account row for them, so existing connections stay visible and can be
 * disconnected without pretending the workspace uses them.
 */
export const PROVIDERS: Provider[] = [
  { id: 'gmail', name: 'Gmail', short: '@', color: '#3461db', group: 'email', multi: true, path: '/api/integrations/gmail/connect', description: 'Read, search, compose, and reply. Connect more than one mailbox.', capability: 'Mailbox operations' },
  { id: 'outlook', name: 'Outlook', short: 'O', color: '#1267b2', group: 'email', path: '', description: 'Microsoft email support is planned for a future release.', capability: 'Mailbox integration pending' },
  { id: 'linkedin', name: 'LinkedIn', short: 'in', color: '#0a66c2', group: 'social', path: '/api/integrations/linkedin/connect', description: 'Connect your identity. Publishing needs additional approved access.', capability: 'Identity connection' },
  { id: 'instagram', name: 'Instagram', short: 'ig', color: '#b3437e', group: 'social', path: '', description: 'Plan your Instagram content now. Publishing and inbox access are not enabled.', capability: 'Publishing integration pending' },
  { id: 'facebook', name: 'Facebook', short: 'f', color: '#1877f2', group: 'social', path: '', description: 'Draft Facebook content alongside the rest of your channels.', capability: 'Publishing integration pending' },
  { id: 'pinterest', name: 'Pinterest', short: 'p', color: '#b82939', group: 'social', path: '/api/integrations/pinterest/connect', description: 'Connect Pinterest for its existing account and analytics integration.', capability: 'Account and analytics connection' },
  { id: 'etsy', name: 'Etsy', short: 'E', color: '#d3541f', group: 'other', path: '/api/integrations/etsy/connect', description: 'Connected by the earlier dashboard. No email or social feature uses it yet.', capability: 'Shop connection' },
  { id: 'google_analytics', name: 'Google Analytics', short: 'GA', color: '#c0621a', group: 'other', path: '/api/integrations/google_analytics/connect', description: 'Connected by the earlier dashboard. No email or social feature uses it yet.', capability: 'Analytics connection' },
  { id: 'stripe_account', name: 'Stripe', short: 'S', color: '#5851c9', group: 'other', path: '/api/integrations/stripe/connect', description: 'Connected by the earlier dashboard. No email or social feature uses it yet.', capability: 'Payments connection' },
]

export function providerFor(id: string): Provider | undefined { return PROVIDERS.find(p => p.id === id) }

/** One plain sentence for an account that is not healthy, or null when it is. */
export function accountProblem(account: ChannelAccount): string | null {
  if (account.status === 'connected') return null
  const detail = account.error ?? ''
  if (/token refresh|invalid_grant|expired/i.test(detail)) return 'The saved sign-in no longer works. Reconnect to keep using this account.'
  if (/decrypt/i.test(detail)) return 'The stored credentials could not be read. Reconnect this account.'
  if (account.status === 'error') return 'This connection stopped working. Reconnect to continue.'
  return 'This account is not connected right now.'
}
