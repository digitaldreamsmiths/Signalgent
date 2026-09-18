import type { WorkspaceData, ContentItem, Contact } from './types'

// Explicitly fictional, confined to /preview. Never merged into a live workspace.
export function previewWorkspace(): WorkspaceData {
  const now = new Date(); now.setHours(10, 0, 0, 0)
  const at = (day: number) => new Date(now.getTime() + day * 86400000).toISOString()
  const base = { company_id: 'preview', created_at: at(-3), updated_at: at(0) }
  const content: ContentItem[] = [
    { ...base, id: 'post-1', title: 'A little more signal. A lot less noise.', body: 'The best marketing starts with a real conversation. This month, we’re sharing the ideas, small experiments, and thoughtful details behind our work.\n\nWhat would you like to see next?', channels: ['linkedin', 'instagram'], status: 'planned', planned_at: at(0), campaign_id: 'campaign-1', image_url: null },
    { ...base, id: 'post-2', title: 'The September edit', body: 'A fresh perspective for your inbox.\n\nHere’s what we’ve been working on, what we’ve learned, and what’s coming next. Thanks for being part of the conversation.', channels: ['email'], status: 'review', planned_at: at(1), campaign_id: 'campaign-1', image_url: null },
    { ...base, id: 'post-3', title: 'Behind the work: from idea to launch', body: 'Good work is a series of small, intentional decisions. Here’s a closer look at our process—from the first sketch to the final detail.', channels: ['instagram', 'facebook'], status: 'planned', planned_at: at(2), campaign_id: 'campaign-1', image_url: null },
    { ...base, id: 'post-4', title: 'Three questions worth asking', body: 'Who are we speaking to?\nWhat do they need?\nHow can we make their day a little better?\n\nA simple starting point for your next campaign.', channels: ['linkedin'], status: 'draft', planned_at: null, campaign_id: null, image_url: null },
    { ...base, id: 'post-5', title: 'A collection of things that inspire us', body: 'Good design, considered details, and ideas worth saving. A few of our recent favorites.', channels: ['pinterest'], status: 'approved', planned_at: at(4), campaign_id: null, image_url: null },
  ]
  const contacts: Contact[] = [
    { ...base, id: 'person-1', name: 'Alex Morgan', email: 'alex@example.com', organization: 'Northline Studio', tags: ['Client', 'Design'], subscription: 'subscribed', consent_note: 'Sample signup form subscription', notes: 'Interested in the next creative workshop.' },
    { ...base, id: 'person-2', name: 'Sam Rivera', email: 'sam@example.com', organization: 'Fieldwork', tags: ['Partner'], subscription: 'not_subscribed', consent_note: '', notes: 'Follow up on the collaboration brief.' },
    { ...base, id: 'person-3', name: 'Jamie Chen', email: 'jamie@example.com', organization: 'Daybreak Co.', tags: ['Newsletter'], subscription: 'subscribed', consent_note: 'Sample newsletter subscription', notes: '' },
    { ...base, id: 'person-4', name: 'Taylor Brooks', email: 'taylor@example.com', organization: 'Common Ground', tags: ['Lead'], subscription: 'not_subscribed', consent_note: '', notes: '' },
  ]
  return { content, contacts, campaigns: [{ ...base, id: 'campaign-1', name: 'September stories', objective: 'Share the work, start conversations, and bring our community closer.', status: 'active' }], accounts: [
    { id: 'gmail-preview', service: 'gmail', label: 'hello@example.com', status: 'connected', scopes: [], error: null },
    { id: 'gmail-preview-2', service: 'gmail', label: 'orders@example.com', status: 'error', scopes: [], error: 'Token refresh failed: invalid_grant' },
    { id: 'linkedin-preview', service: 'linkedin', label: 'Northline Studio', status: 'connected', scopes: ['openid', 'profile'], error: null },
    { id: 'pinterest-preview', service: 'pinterest', label: 'Northline Studio', status: 'connected', scopes: [], error: null },
  ], outreach: { sent: 148, queued: 12, failed: 2, prospects: 264 } }
}
