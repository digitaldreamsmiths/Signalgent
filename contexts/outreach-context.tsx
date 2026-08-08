'use client'

/**
 * Shared outreach workspace data.
 *
 * The workspace was one component that owned the snapshot, so every view lived
 * on one page. A Next layout can't pass props down to page children, so
 * splitting the sections into routes needs the data in context first — without
 * it each route would re-fetch the entire workspace on every navigation.
 *
 * What lives here: everything that is the same no matter which section you are
 * looking at (the snapshot, campaigns + the campaign scope, the queued-send
 * list, toasts, the poll) PLUS the active view's query and its one page of
 * rows. What stays with each view: its own selection and dialog state.
 *
 * PAGING. The snapshot used to carry every prospect (~4,900 on SourceGent) and
 * the client sliced it into the ten views. Now the server filters, sorts and
 * counts (see `lib/integrations/outreach/query.ts`) and returns `limit` rows;
 * the counts that label the tabs and rail come from `snapshot.views`, never
 * from row lengths. The query lives here rather than in the views because it
 * determines what gets fetched, and because the ~150s poll has to refresh the
 * ALREADY-LOADED window in place — re-requesting offset 0 with the current
 * limit — so a background tick never bounces the user back to the first page.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useCompany } from '@/contexts/company-context'
import { getOutreachWorkspace } from '@/lib/integrations/outreach/actions'
import { getScheduledSends } from '@/lib/integrations/outreach/sending'
import {
  PROSPECT_MAX_LOADED,
  PROSPECT_PAGE_SIZE,
  defaultSort,
  filtersOf,
  sectionFromPathname,
  type Filter,
  type ProspectSort,
  type StageBucket,
} from '@/lib/integrations/outreach/views'
import type { OutreachCampaign } from '@/lib/integrations/outreach/campaigns'
import type {
  CampaignStats,
  OutreachProspectView,
  OutreachSnapshot,
  ProspectQuery,
  ScheduledSendView,
} from '@/lib/integrations/outreach/types'

// The view vocabulary moved to a plain module so the server can share it (the
// per-view counts are computed there now). Re-exported so the existing
// `@/contexts/outreach-context` imports keep working.
export {
  FILTER_LABEL,
  SECTIONS,
  SECTION_HREF,
  SECTION_OF,
  type Filter,
  type Section,
} from '@/lib/integrations/outreach/views'
export type { CampaignStats } from '@/lib/integrations/outreach/types'

export type Toast = { id: number; text: string; kind: 'info' | 'error' }

interface OutreachContextValue {
  companyId: string | null
  /** Metrics, per-view counts, campaigns, sending health. Fixed size. */
  snapshot: OutreachSnapshot | null
  /** True until the first workspace read lands. */
  loading: boolean
  /** Re-read the workspace, keeping the current view, sort and loaded window. */
  refresh: () => Promise<void>

  // ── The active view and its page ───────────────────────────────────────────
  view: Filter
  setView: (f: Filter) => void
  /** The loaded rows of the active view — a prefix, not the whole view. */
  rows: OutreachProspectView[]
  /** How many rows match the view in full, so labels can say "100 of 4,933". */
  total: number
  hasMore: boolean
  /** A page read is in flight (initial, view change, or Load more). */
  rowsLoading: boolean
  loadMore: () => void

  sort: ProspectSort
  dir: 'asc' | 'desc'
  /** Sort by `key`; repeating the current key flips the direction. */
  toggleSort: (key: ProspectSort) => void
  /** Contacts-table status chip. 'all' = no stage filter. */
  stage: StageBucket | 'all'
  setStage: (s: StageBucket | 'all') => void

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
  const section = sectionFromPathname(usePathname())

  const [snapshot, setSnapshot] = useState<OutreachSnapshot | null>(null)
  const [rows, setRows] = useState<OutreachProspectView[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)


  const sectionFilters = filtersOf(section)
  const [viewState, setViewState] = useState<Filter>(() => sectionFilters[0])
  // Navigating between sections lands on that section's first view; a sub-tab
  // click within a section keeps the chosen one. Derived rather than synced in
  // an effect, so no read ever goes out for the section you just left.
  const view = sectionFilters.includes(viewState) ? viewState : sectionFilters[0]

  const [{ sort, dir }, setSortState] = useState(() => defaultSort(sectionFilters[0]))
  const [stage, setStageState] = useState<StageBucket | 'all'>('all')
  const [limit, setLimit] = useState(PROSPECT_PAGE_SIZE)
  const [campaignFilter, setCampaignFilterState] = useState<string>('all')

  // Sort, stage filter and the loaded window belong to a view; changing view
  // resets all three. Adjusted during render (React's documented pattern for
  // state derived from something else) rather than in an effect, so the fetch
  // below never fires once with the old sort and again with the new one.
  const [sortedView, setSortedView] = useState(view)
  if (sortedView !== view) {
    setSortedView(view)
    setSortState(defaultSort(view))
    setStageState('all')
    setLimit(PROSPECT_PAGE_SIZE)
  }

  const [scheduledSends, setScheduledSends] = useState<ScheduledSendView[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [setupKey, setSetupKey] = useState(0)
  const toastSeq = useRef(0)
  // Only poll the queued-send list once a view has actually asked for it, so
  // someone who never opens Schedule doesn't pay for it every tick.
  const scheduledLoaded = useRef(false)

  // Anything that changes WHICH rows match starts the window over at one page —
  // holding a 400-row window across a re-filter would fetch 400 rows of a list
  // the user hasn't looked at yet.
  const setView = useCallback((f: Filter) => setViewState(f), [])

  const toggleSort = useCallback((key: ProspectSort) => {
    setSortState((s) => (s.sort === key
      ? { sort: key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { sort: key, dir: key === 'added' ? 'desc' : 'asc' }))
    setLimit(PROSPECT_PAGE_SIZE)
  }, [])

  const setStage = useCallback((s: StageBucket | 'all') => {
    setStageState(s)
    setLimit(PROSPECT_PAGE_SIZE)
  }, [])

  const setCampaignFilter = useCallback((v: string) => {
    setCampaignFilterState(v)
    setLimit(PROSPECT_PAGE_SIZE)
  }, [])

  const loadMore = useCallback(() => setLimit((n) => Math.min(n + PROSPECT_PAGE_SIZE, PROSPECT_MAX_LOADED)), [])

  const query = useMemo<ProspectQuery>(
    // offset stays 0 and `limit` grows: one request always covers the whole
    // loaded window, so Load more and the poll take the identical path and
    // rows already on screen refresh instead of going stale.
    () => ({ view, campaignId: campaignFilter, sort, dir, stage, offset: 0, limit }),
    [view, campaignFilter, sort, dir, stage, limit],
  )

  // "Which query are the rows on screen for?" — derived rather than a flag set
  // in the fetch effect, so a background poll (same query) never flashes a
  // spinner while changing view or loading a page does.
  const queryKey = useMemo(() => JSON.stringify(query), [query])
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const rowsLoading = loadedKey !== queryKey

  // The poll and every action's `refresh()` re-read whatever is on screen NOW.
  // Going through a ref keeps `refresh` stable, so loading another page doesn't
  // tear down and restart the 150s interval.
  const queryRef = useRef({ query, queryKey })
  useEffect(() => { queryRef.current = { query, queryKey } }, [query, queryKey])

  // The one place rows are fetched on their own: mount, and every query change.
  // The cleanup flag drops a superseded response rather than letting a slow
  // earlier query overwrite a fresher page — easy to trigger by clicking
  // through sub-tabs.
  useEffect(() => {
    if (!companyId) return
    let active = true
    ;(async () => {
      const data = await getOutreachWorkspace(companyId, query)
      if (!active) return
      if (data) {
        setSnapshot(data.snapshot)
        setRows(data.page.rows)
        setTotal(data.page.total)
      }
      setLoadedKey(queryKey)
      setLoading(false)
    })()
    return () => { active = false }
  }, [companyId, query, queryKey])

  const refresh = useCallback(async () => {
    if (!companyId) return
    const { query: q, queryKey: k } = queryRef.current
    const data = await getOutreachWorkspace(companyId, q)
    // A view change during the round trip wins: its own read is already on the
    // way with the right rows.
    if (queryRef.current.queryKey !== k) return
    if (data) {
      setSnapshot(data.snapshot)
      setRows(data.page.rows)
      setTotal(data.page.total)
    }
    setLoadedKey(k)
    setLoading(false)
    setSetupKey((n) => n + 1) // setup state rides on the same events as the snapshot
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

  // The cron mutates send/reply state every ~5 minutes; poll while the tab is
  // visible (and refetch the moment it becomes visible again) so counts stay
  // current without a manual reload. Refetching the loaded window rather than
  // resetting it is what keeps scroll, selection and "Load more" progress.
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

  const campaigns = useMemo(() => snapshot?.campaigns ?? [], [snapshot])
  const campaignStats = useMemo(
    () => new Map(Object.entries(snapshot?.campaign_stats ?? {})),
    [snapshot],
  )

  const value: OutreachContextValue = {
    companyId, snapshot, loading, refresh,
    view, setView, rows, total, hasMore: rows.length < total, rowsLoading, loadMore,
    sort, dir, toggleSort, stage, setStage,
    campaigns, campaignStats, campaignFilter, setCampaignFilter,
    scheduledSends, loadScheduled,
    toasts, pushToast, dismissToast,
    setupKey,
  }

  return <OutreachContext.Provider value={value}>{children}</OutreachContext.Provider>
}
