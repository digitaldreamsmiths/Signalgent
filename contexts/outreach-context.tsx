'use client'

/**
 * Shared outreach workspace data — Phase 5 stage 2 of
 * docs/specs/signalgent-govcon-v1.md.
 *
 * The workspace was one component that owned the snapshot, so every view lived
 * on one page. A Next layout can't pass props down to page children, so
 * splitting the sections into routes needs the data in context first — without
 * it each route would re-fetch the entire workspace on every navigation.
 *
 * What lives here: everything that is the same no matter which section you are
 * looking at (snapshot, campaigns + the campaign scope, the queued-send list,
 * toasts, the poll). What stays with each view: its own selection, sort, and
 * dialog state.
 *
 * NOTE this does not change how much data is fetched — `getOutreachSnapshot`
 * still loads every prospect (~4,900 today). That scale debt is tracked
 * separately in the spec; the provider just stops routes from multiplying it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import { getOutreachSnapshot } from '@/lib/integrations/outreach/actions'
import { getScheduledSends } from '@/lib/integrations/outreach/sending'
import type { OutreachCampaign } from '@/lib/integrations/outreach/campaigns'
import type { OutreachProspectView, OutreachSnapshot, ScheduledSendView } from '@/lib/integrations/outreach/types'

// ── View vocabulary ──────────────────────────────────────────────────────────
// Lives here rather than in the widget file so both the nav (which will move to
// the layout) and the views can read it.

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

/** Per-campaign funnel, derived from the snapshot the workspace already holds. */
export interface CampaignStats {
  prospects: number
  sent: number
  replied: number
  opened: number
}

export type Toast = { id: number; text: string; kind: 'info' | 'error' }

interface OutreachContextValue {
  companyId: string | null
  snapshot: OutreachSnapshot | null
  loading: boolean
  refresh: () => Promise<void>

  /** Every prospect, ignoring the campaign scope. */
  allProspects: OutreachProspectView[]
  /** Prospects within the current campaign scope — what the views render. */
  prospects: OutreachProspectView[]
  /** Prospect lists per view, already campaign-scoped. */
  lists: Record<Filter, OutreachProspectView[]>

  campaigns: OutreachCampaign[]
  campaignStats: Map<string, CampaignStats>
  /** 'all' = everything, 'none' = the campaign-less pool, else a campaign id. */
  campaignFilter: string
  setCampaignFilter: (v: string) => void

  scheduledSends: ScheduledSendView[]
  loadScheduled: () => Promise<void>

  toasts: Toast[]
  pushToast: (text: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void

  /** Bumped whenever something the setup checklist measures changes. */
  setupKey: number
}

const OutreachContext = createContext<OutreachContextValue | null>(null)

export function useOutreach(): OutreachContextValue {
  const ctx = useContext(OutreachContext)
  if (!ctx) throw new Error('useOutreach must be used inside <OutreachProvider>')
  return ctx
}

export function OutreachProvider({ children }: { children: React.ReactNode }) {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [snapshot, setSnapshot] = useState<OutreachSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [campaignFilter, setCampaignFilter] = useState<string>('all')
  const [scheduledSends, setScheduledSends] = useState<ScheduledSendView[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [setupKey, setSetupKey] = useState(0)
  const toastSeq = useRef(0)
  // Only poll the queued-send list once a view has actually asked for it, so
  // someone who never opens Schedule doesn't pay for it every tick.
  const scheduledLoaded = useRef(false)

  const refresh = useCallback(async () => {
    if (!companyId) return
    const snap = await getOutreachSnapshot(companyId)
    setSnapshot(snap)
    setSetupKey((k) => k + 1) // setup state rides on the same events as the snapshot
  }, [companyId])

  const loadScheduled = useCallback(async () => {
    if (!companyId) return
    scheduledLoaded.current = true
    setScheduledSends(await getScheduledSends(companyId))
  }, [companyId])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    (text: string, kind: Toast['kind'] = 'info') => {
      const id = ++toastSeq.current
      setToasts((prev) => [...prev, { id, text, kind }])
      if (kind !== 'error') setTimeout(() => dismissToast(id), 4000)
    },
    [dismissToast],
  )

  // Initial load. No per-company reset needed: the layout keys this provider by
  // company, so switching workspaces remounts it with fresh state.
  useEffect(() => {
    if (!companyId) return
    let active = true
    ;(async () => {
      const snap = await getOutreachSnapshot(companyId)
      if (!active) return
      setSnapshot(snap)
      setLoading(false)
    })()
    return () => { active = false }
  }, [companyId])

  // The cron mutates send/reply state every ~5 minutes; poll while the tab is
  // visible (and refetch the moment it becomes visible again) so counts stay
  // current without a manual reload.
  useEffect(() => {
    if (!companyId) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      refresh()
      if (scheduledLoaded.current) loadScheduled()
    }
    const interval = setInterval(tick, 150_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [companyId, refresh, loadScheduled])

  const allProspects = useMemo(() => snapshot?.prospects ?? [], [snapshot])
  const campaigns = useMemo(() => snapshot?.campaigns ?? [], [snapshot])

  const campaignStats = useMemo(() => {
    const map = new Map<string, CampaignStats>()
    for (const p of allProspects) {
      if (!p.campaign_id) continue
      const s = map.get(p.campaign_id) ?? { prospects: 0, sent: 0, replied: 0, opened: 0 }
      s.prospects += 1
      if (p.drafts.some((d) => d.status === 'exported' || d.send?.status === 'sent')) s.sent += 1
      if (p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested') s.replied += 1
      if (p.drafts.some((d) => d.send?.opened_at)) s.opened += 1
      map.set(p.campaign_id, s)
    }
    return map
  }, [allProspects])

  const prospects = useMemo(() => {
    if (campaignFilter === 'all') return allProspects
    return allProspects.filter((p) => (campaignFilter === 'none' ? !p.campaign_id : p.campaign_id === campaignFilter))
  }, [allProspects, campaignFilter])

  const lists = useMemo<Record<Filter, OutreachProspectView[]>>(() => {
    const withDraft = prospects.filter((p) => p.draft)
    return {
      contacts: prospects,
      review: withDraft.filter((p) => !p.draft!.is_template && p.draft!.status === 'pending'),
      templates: withDraft.filter((p) => p.draft!.is_template && p.draft!.status === 'pending' && !p.needs_review),
      needs_review: prospects.filter((p) => p.needs_review),
      approved: withDraft.filter((p) => p.draft!.status === 'approved' || p.draft!.status === 'edited'),
      exported: withDraft.filter((p) => p.draft!.status === 'exported'),
      replied: prospects.filter((p) => p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested'),
      bounced: prospects.filter((p) => p.disposition === 'bounced' || p.disposition === 'unsubscribed'),
      scheduled: [], // the Schedule view renders from scheduledSends, not this list
      all: withDraft,
    }
  }, [prospects])

  const value: OutreachContextValue = {
    companyId, snapshot, loading, refresh,
    allProspects, prospects, lists,
    campaigns, campaignStats, campaignFilter, setCampaignFilter,
    scheduledSends, loadScheduled,
    toasts, pushToast, dismissToast,
    setupKey,
  }

  return <OutreachContext.Provider value={value}>{children}</OutreachContext.Provider>
}
