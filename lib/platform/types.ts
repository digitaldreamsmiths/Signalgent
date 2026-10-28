export type Channel = 'email' | 'linkedin' | 'instagram' | 'facebook' | 'pinterest'
export type ContentStatus = 'draft' | 'review' | 'approved' | 'planned' | 'archived'
export interface ContentItem {
  id: string; company_id: string; title: string; body: string; channels: Channel[];
  status: ContentStatus; planned_at: string | null; campaign_id: string | null;
  image_url: string | null; created_at: string; updated_at: string;
  /** Per-channel text. A channel without an entry publishes `body`. */
  variants: Partial<Record<Channel, string>>;
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
  /** Provider-reported failure (e.g. a refresh-token rejection); null while healthy. */
  error: string | null;
}
export interface WorkspaceData {
  content: ContentItem[]; contacts: Contact[]; campaigns: Campaign[]; accounts: ChannelAccount[];
  outreach: { sent: number; queued: number; failed: number; prospects: number };
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
export type Section = 'today' | 'inbox' | 'contacts' | 'email' | 'social' | 'calendar' | 'reports' | 'connections'
/** `limit` is the channel's hard character cap; `ideal` is the length the drafter aims for. */
export const CHANNELS: Record<Channel, { label: string; color: string; short: string; limit: number; ideal: string; style: string }> = {
  email: { label: 'Email', color: '#3461db', short: '@', limit: 50000, ideal: '120 to 250 words', style: 'A short newsletter note with a greeting, two or three short paragraphs, and one clear next step. No hashtags.' },
  linkedin: { label: 'LinkedIn', color: '#0a66c2', short: 'in', limit: 3000, ideal: '80 to 180 words', style: 'A professional post. Strong first line, since only the first two lines show before "see more". Short paragraphs, one idea each. At most three hashtags at the end.' },
  instagram: { label: 'Instagram', color: '#b3437e', short: 'ig', limit: 2200, ideal: '40 to 120 words', style: 'A caption. Conversational, first line hooks, line breaks between thoughts. Three to five hashtags on their own line at the end. Assume an image accompanies it.' },
  facebook: { label: 'Facebook', color: '#1877f2', short: 'f', limit: 5000, ideal: '40 to 100 words', style: 'A friendly post. Plain language, one or two short paragraphs, ends with a question or invitation. No more than one hashtag.' },
  pinterest: { label: 'Pinterest', color: '#b82939', short: 'p', limit: 500, ideal: '20 to 60 words', style: 'A pin description. Descriptive and searchable, names what the pin shows and why it is useful. Two or three hashtags at the end. Under 500 characters.' },
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
