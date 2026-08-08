/**
 * The outreach view vocabulary — which sections exist, which filtered views each
 * one contains, and how they're labelled.
 *
 * This used to live in `contexts/outreach-context.tsx`, but paging moved the
 * filtering to the server: the snapshot now counts every view and returns one
 * page of the active one, so the server needs the same vocabulary the nav does.
 * A 'use client' module can't be imported from a server action, hence this
 * plain module. The context re-exports everything here, so existing imports
 * from `@/contexts/outreach-context` keep working.
 */

export type Filter =
  | 'contacts' | 'review' | 'templates' | 'needs_review' | 'approved'
  | 'exported' | 'replied' | 'bounced' | 'scheduled' | 'all'

export type Section = 'pipeline' | 'contacts' | 'inbox' | 'schedule'

export const SECTIONS: { key: Section; label: string; filters: Filter[] }[] = [
  // Order matters: the first filter is the section's landing view.
  { key: 'pipeline', label: 'Pipeline', filters: ['review', 'templates', 'needs_review', 'approved', 'exported', 'all'] },
  { key: 'contacts', label: 'Contacts', filters: ['contacts'] },
  { key: 'inbox', label: 'Inbox', filters: ['replied', 'bounced'] },
  { key: 'schedule', label: 'Schedule', filters: ['scheduled'] },
]

export const SECTION_OF: Record<Filter, Section> = SECTIONS.reduce((acc, s) => {
  for (const f of s.filters) acc[f] = s.key
  return acc
}, {} as Record<Filter, Section>)

export const FILTER_LABEL: Record<Filter, string> = {
  contacts: 'Contacts',
  review: 'To review',
  templates: 'Templates',
  needs_review: 'Needs review',
  approved: 'Ready to email',
  exported: 'Sent',
  replied: 'Replied',
  bounced: 'Bounced / opt-out',
  scheduled: 'Scheduled',
  all: 'All',
}

export const FILTERS = Object.keys(FILTER_LABEL) as Filter[]

/** Sort keys accepted by a paged prospect query. Not every view offers every
 * key (the Contacts table exposes domain/campaign/added; the draft lists expose
 * type/name/email/status) — the server just applies whichever it is given. */
export type ProspectSort = 'type' | 'name' | 'email' | 'domain' | 'status' | 'campaign' | 'added'

/** Coarse lifecycle bucket behind the Contacts table's status chips. */
export type StageBucket = 'new' | 'review' | 'ready' | 'emailed' | 'replied' | 'other'

export const STAGE_BUCKETS: StageBucket[] = ['new', 'review', 'ready', 'emailed', 'replied', 'other']

/** How many rows one "page" of a view is. The list appends a page at a time. */
export const PROSPECT_PAGE_SIZE = 100

/** Ceiling on how far "Load more" can stretch the loaded window. Past this the
 * UI asks for a narrower scope instead: every loaded row carries its drafts'
 * full copy, and a refresh re-reads the whole window every ~150s. */
export const PROSPECT_MAX_LOADED = 2000

export const SECTION_HREF: Record<Section, string> = {
  pipeline: '/outreach/pipeline',
  contacts: '/outreach/contacts',
  inbox: '/outreach/inbox',
  schedule: '/outreach/schedule',
}

/** Which section a URL is showing. `/outreach` itself redirects to Pipeline,
 * so anything unrecognised resolves there too. */
export function sectionFromPathname(pathname: string): Section {
  for (const s of SECTIONS) {
    const href = SECTION_HREF[s.key]
    if (pathname === href || pathname.startsWith(href + '/')) return s.key
  }
  return 'pipeline'
}

export function filtersOf(section: Section): Filter[] {
  return SECTIONS.find((s) => s.key === section)!.filters
}

/**
 * The sort a view opens on, matching what each list showed before paging: the
 * draft lists grouped Personalized-then-Templates, and everything else in
 * ingest order (newest first), which is how the snapshot query returned rows.
 */
export function defaultSort(view: Filter): { sort: ProspectSort; dir: 'asc' | 'desc' } {
  return view === 'approved' || view === 'exported' || view === 'all'
    ? { sort: 'type', dir: 'asc' }
    : { sort: 'added', dir: 'desc' }
}
