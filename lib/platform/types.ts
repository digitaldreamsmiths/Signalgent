export type Channel = 'email' | 'linkedin' | 'instagram' | 'facebook' | 'pinterest'
export type ContentStatus = 'draft' | 'review' | 'approved' | 'planned' | 'archived'
export interface ContentItem {
  id: string; company_id: string; title: string; body: string; channels: Channel[];
  status: ContentStatus; planned_at: string | null; campaign_id: string | null;
  image_url: string | null; created_at: string; updated_at: string;
}
export interface Contact {
  id: string; company_id: string; name: string; email: string; organization: string;
  tags: string[]; subscription: 'not_subscribed' | 'subscribed' | 'unsubscribed';
  consent_note: string; notes: string; created_at: string; updated_at: string;
}
export interface Campaign {
  id: string; company_id: string; name: string; objective: string;
  status: 'draft' | 'active' | 'completed'; created_at: string; updated_at: string;
}
export interface ChannelAccount {
  id: string; service: string; label: string; status: string; scopes: string[];
}
export interface WorkspaceData {
  content: ContentItem[]; contacts: Contact[]; campaigns: Campaign[]; accounts: ChannelAccount[];
  outreach: { sent: number; queued: number; failed: number; prospects: number };
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
export type Section = 'today' | 'inbox' | 'contacts' | 'email' | 'social' | 'calendar' | 'reports' | 'connections'
export const CHANNELS: Record<Channel, { label: string; color: string; short: string }> = {
  email: { label: 'Email', color: '#3461db', short: '@' },
  linkedin: { label: 'LinkedIn', color: '#0a66c2', short: 'in' },
  instagram: { label: 'Instagram', color: '#b3437e', short: 'ig' },
  facebook: { label: 'Facebook', color: '#1877f2', short: 'f' },
  pinterest: { label: 'Pinterest', color: '#b82939', short: 'p' },
}
export const EMPTY_WORKSPACE: WorkspaceData = {
  content: [], contacts: [], campaigns: [], accounts: [],
  outreach: { sent: 0, queued: 0, failed: 0, prospects: 0 },
}
export const NAV: { id: Section; label: string }[] = [
  { id: 'today', label: 'Overview' }, { id: 'inbox', label: 'Inbox' },
  { id: 'contacts', label: 'Contacts' }, { id: 'email', label: 'Email campaigns' },
  { id: 'social', label: 'Social studio' }, { id: 'calendar', label: 'Calendar' },
  { id: 'reports', label: 'Reports' }, { id: 'connections', label: 'Connections' },
]
