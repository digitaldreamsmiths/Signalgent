/**
 * Server-side paging for the outreach workspace.
 *
 * The snapshot used to hand the browser every prospect, every touch and every
 * send — ~4,900 prospects on the SourceGent workspace — on mount AND on the
 * ~150s poll, then filter, count and sort all of it client-side. This module
 * does that work on the server and ships one page.
 *
 * Two passes, on purpose:
 *
 *  1. INDEX — one lean pass over prospects/drafts/sends. Enough to decide view
 *     membership, campaign scope, stage bucket and sort order, and to count
 *     every view, but WITHOUT the draft subject/body/facts, which are the bulk
 *     of the payload and are only ever read for rows actually on screen.
 *  2. HYDRATE — full draft rows for the page's prospects only.
 *
 * The predicates themselves live in `stage.ts` and are shared with the client,
 * so "what counts as To review" has exactly one definition.
 *
 * Paging traps this codebase has already hit, and how they are handled here:
 *  - PostgREST silently truncates every read at 1,000 rows, so both index reads
 *    go through `fetchAllPages` with a deterministic `.order(...).order('id')`
 *    tiebreaker (bulk ingests give thousands of rows the same created_at).
 *  - Offset paging over an unstable sort skips and duplicates rows, so every
 *    comparator here ends in an id tiebreak.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { fetchAllPages, fetchAllPagesResult } from './fetch-all'
import { resolveContactName } from './contact-name'
import {
  byName,
  contactStage,
  matchesCampaign,
  matchesView,
  rowStage,
  stageBucket,
  type ProspectLike,
} from './stage'
import { FILTERS, PROSPECT_MAX_LOADED, STAGE_BUCKETS, type Filter, type ProspectSort, type StageBucket } from './views'
import type {
  CampaignStats,
  OutreachDraftView,
  OutreachProspectView,
  OutreachSendView,
  ProspectQuery,
  TemplateStat,
} from './types'

type DB = SupabaseClient<Database>
type ProspectRow = Database['public']['Tables']['outreach_prospects']['Row']
type DraftRow = Database['public']['Tables']['outreach_drafts']['Row']

/** Prospect ids per hydration query. `.in()` goes into the URL, so a few
 * thousand uuids would blow past PostgREST's URL limit — chunk it. */
const HYDRATE_CHUNK = 100

// ── Index shapes ─────────────────────────────────────────────────────────────

interface DraftIndex {
  id: string
  prospect_id: string
  status: OutreachDraftView['status']
  step: number
  template_id: string | null
  is_template: boolean
  send: OutreachSendView | null
}

/** One prospect, reduced to what filtering/sorting/counting needs — plus the
 * raw row, so hydrating a page costs one extra query (drafts) rather than two. */
export interface ProspectIndex extends ProspectLike {
  raw: ProspectRow
  thread_id: string | null
  drafts: DraftIndex[]
  draft: DraftIndex | null
}

export interface OutreachIndex {
  rows: ProspectIndex[]
  /** Sends currently waiting in the drip queue (whole company). */
  queued: number
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// ── Pass 1: the index ────────────────────────────────────────────────────────

/** The columns the index actually reads. `template_id` arrives via an
 * out-of-band migration, so a failure here falls back to a tolerant `select('*')`
 * rather than reporting an empty drafts table. */
const DRAFT_INDEX_COLUMNS = 'id, prospect_id, status, step, template_id, facts_for_draft'

export async function loadOutreachIndex(supabase: DB, companyId: string): Promise<OutreachIndex> {
  const [prospects, draftRows, sends] = await Promise.all([
    // select('*') rather than a column list: campaign_id / contact_name arrive
    // via out-of-band migrations, and '*' keeps working before they land. It
    // also means hydration never needs a second prospect read.
    fetchAllPages<ProspectRow>((from, to) =>
      supabase.from('outreach_prospects').select('*').eq('company_id', companyId)
        .order('created_at', { ascending: false }).order('id').range(from, to)),
    loadDraftIndexRows(supabase, companyId),
    fetchAllPages<{ id: string; draft_id: string; prospect_id: string; status: OutreachSendView['status']; scheduled_at: string | null; sent_at: string | null; opened_at: string | null; thread_id: string | null; error: string | null }>((from, to) =>
      supabase.from('outreach_sends').select('id, draft_id, prospect_id, status, scheduled_at, sent_at, opened_at, thread_id, error').eq('company_id', companyId)
        .order('created_at', { ascending: false }).order('id').range(from, to)),
  ])

  // Latest send per draft (rows arrive newest-first, so first seen wins).
  const sendByDraft = new Map<string, OutreachSendView>()
  // Gmail thread per prospect, for the "open the conversation" deep link.
  // Follow-ups thread under the opener, so any send's thread id reaches the
  // same conversation; newest-first ordering makes this the most recent one.
  const threadByProspect = new Map<string, string>()
  let queued = 0
  for (const s of sends) {
    if (s.status === 'queued') queued += 1
    if (s.thread_id && !threadByProspect.has(s.prospect_id)) threadByProspect.set(s.prospect_id, s.thread_id)
    if (!sendByDraft.has(s.draft_id)) {
      sendByDraft.set(s.draft_id, { id: s.id, status: s.status, scheduled_at: s.scheduled_at, sent_at: s.sent_at, opened_at: s.opened_at ?? null, error: s.error })
    }
  }

  const draftsByProspect = new Map<string, DraftIndex[]>()
  for (const d of draftRows) {
    const view: DraftIndex = {
      id: d.id,
      prospect_id: d.prospect_id,
      status: d.status,
      step: d.step,
      template_id: d.template_id ?? null,
      is_template: asStringArray(d.facts_for_draft).length === 0,
      send: sendByDraft.get(d.id) ?? null,
    }
    const arr = draftsByProspect.get(d.prospect_id)
    if (arr) arr.push(view)
    else draftsByProspect.set(d.prospect_id, [view])
  }
  // Order each prospect's touches by step (1 = initial email).
  for (const arr of draftsByProspect.values()) arr.sort((a, b) => a.step - b.step)

  const rows: ProspectIndex[] = prospects.map((p) => {
    const drafts = draftsByProspect.get(p.id) ?? []
    return {
      raw: p,
      id: p.id,
      email: p.email,
      domain: p.domain,
      created_at: p.created_at,
      status: p.status,
      recipient_name: p.recipient_name,
      campaign_id: p.campaign_id ?? null,
      disposition: p.disposition,
      thread_id: threadByProspect.get(p.id) ?? null,
      drafts,
      draft: drafts.at(-1) ?? null,
      // A plausible-but-uncertain resolver result (low confidence) — surfaced
      // for manual disambiguation rather than left as a silent skip. Only while
      // it still awaits a decision: approving/editing/sending a draft anyway
      // (or the prospect closing) is a decision, so the flag clears instead of
      // nagging forever.
      needs_review:
        p.status === 'skipped' &&
        p.skip_stage === 'enrich' &&
        (p.skip_reason ?? '').startsWith('low_confidence') &&
        p.disposition === 'open' &&
        drafts.every((d) => d.status === 'pending'),
    }
  })

  return { rows, queued }
}

type DraftIndexRow = Pick<DraftRow, 'id' | 'prospect_id' | 'status' | 'step' | 'facts_for_draft'> & { template_id: string | null }

async function loadDraftIndexRows(supabase: DB, companyId: string): Promise<DraftIndexRow[]> {
  const narrow = await fetchAllPagesResult<DraftIndexRow>((from, to) =>
    supabase.from('outreach_drafts').select(DRAFT_INDEX_COLUMNS).eq('company_id', companyId)
      .order('id').range(from, to))
  if (!narrow.error) return narrow.rows
  // A column the migration hasn't added yet — retry tolerantly rather than
  // treating the whole drafts table as empty.
  return fetchAllPages<DraftIndexRow>((from, to) =>
    supabase.from('outreach_drafts').select('*').eq('company_id', companyId)
      .order('id').range(from, to))
}

// ── Counting ─────────────────────────────────────────────────────────────────

/** Row count per view, within a campaign scope. Powers the sub-tab counts and
 * the nav badges, which used to read `lists[filter].length`. */
export function countViews(index: ProspectIndex[], campaignId: string, queued: number): Record<Filter, number> {
  const out = Object.fromEntries(FILTERS.map((f) => [f, 0])) as Record<Filter, number>
  for (const p of index) {
    if (!matchesCampaign(p, campaignId)) continue
    for (const f of FILTERS) if (matchesView(p, f)) out[f] += 1
  }
  // Schedule renders from the queued-send list, not from prospects.
  out.scheduled = queued
  return out
}

export function countStageBuckets(index: ProspectIndex[], campaignId: string): Record<StageBucket, number> {
  const out = Object.fromEntries(STAGE_BUCKETS.map((b) => [b, 0])) as Record<StageBucket, number>
  for (const p of index) {
    if (!matchesCampaign(p, campaignId)) continue
    out[stageBucket(p)] += 1
  }
  return out
}

/** Replies still sitting on the neutral `replied` disposition — the ones a
 * human hasn't triaged into interested / not interested yet. */
export function countUntriaged(index: ProspectIndex[], campaignId: string): number {
  let n = 0
  for (const p of index) if (matchesCampaign(p, campaignId) && p.disposition === 'replied') n += 1
  return n
}

/** Whole-company funnel for the metrics bar. Deliberately NOT campaign-scoped:
 * this is the shape the metrics bar has always shown. */
export function companyCounts(index: ProspectIndex[], queued: number) {
  const has = (fn: (p: ProspectIndex) => boolean) => index.reduce((n, p) => n + (fn(p) ? 1 : 0), 0)
  const sent = has((p) => p.drafts.some((d) => d.status === 'exported'))
  // Any inbound response counts toward reply rate: the auto-detected neutral
  // 'replied' state plus the manually-triaged interested/not_interested.
  const replied = has((p) => p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested')
  return {
    total: index.length,
    new: has((p) => p.status === 'new'),
    personalized: has((p) => !!p.draft && !p.draft.is_template),
    templates: has((p) => !!p.draft && p.draft.is_template),
    approved: has((p) => p.draft?.status === 'approved'),
    exported: has((p) => p.draft?.status === 'exported'),
    needs_review: has((p) => p.needs_review),
    sent,
    replied,
    bounced: has((p) => p.disposition === 'bounced'),
    unsubscribed: has((p) => p.disposition === 'unsubscribed'),
    queued,
  }
}

export function campaignStats(index: ProspectIndex[]): Record<string, CampaignStats> {
  const out: Record<string, CampaignStats> = {}
  for (const p of index) {
    if (!p.campaign_id) continue
    const s = out[p.campaign_id] ?? (out[p.campaign_id] = { prospects: 0, sent: 0, replied: 0, opened: 0 })
    s.prospects += 1
    if (p.drafts.some((d) => d.status === 'exported' || d.send?.status === 'sent')) s.sent += 1
    if (p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested') s.replied += 1
    if (p.drafts.some((d) => d.send?.opened_at)) s.opened += 1
  }
  return out
}

export function templateStats(index: ProspectIndex[]): Record<string, TemplateStat> {
  const out: Record<string, TemplateStat> = {}
  for (const p of index) {
    for (const d of p.drafts) {
      if (!d.template_id) continue
      const s = out[d.template_id] ?? (out[d.template_id] = { assigned: 0, sent: 0, replied: 0, bounced: 0, optout: 0 })
      s.assigned += 1
      if (!(d.status === 'exported' || d.send?.status === 'sent')) continue
      s.sent += 1
      if (p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested') s.replied += 1
      else if (p.disposition === 'bounced') s.bounced += 1
      else if (p.disposition === 'unsubscribed') s.optout += 1
    }
  }
  return out
}

// ── Sorting ──────────────────────────────────────────────────────────────────

/**
 * The comparator for one sort key. `view` matters for 'name': the Contacts
 * table sorts on the resolved company name alone (blank rows collate first),
 * while the draft lists fall back to domain/email — keeping each list ordered
 * exactly the way it was before paging.
 */
function comparator(sort: ProspectSort, view: Filter, campaignNames: Map<string, string>) {
  const campaignName = (p: ProspectLike) => (p.campaign_id ? campaignNames.get(p.campaign_id) ?? '' : '')
  switch (sort) {
    case 'type':
      // Personalized section then Templates (reversed when dir is desc); within
      // a section always by name, which is what the grouped list renders.
      return (a: ProspectIndex, b: ProspectIndex) => Number(!!a.draft?.is_template) - Number(!!b.draft?.is_template)
    case 'name':
      return view === 'contacts'
        ? (a: ProspectIndex, b: ProspectIndex) => (a.recipient_name ?? '').localeCompare(b.recipient_name ?? '')
        : (a: ProspectIndex, b: ProspectIndex) => byName(a, b)
    case 'email': return (a: ProspectIndex, b: ProspectIndex) => a.email.localeCompare(b.email)
    case 'domain': return (a: ProspectIndex, b: ProspectIndex) => (a.domain ?? '').localeCompare(b.domain ?? '')
    case 'status':
      return view === 'contacts'
        ? (a: ProspectIndex, b: ProspectIndex) => contactStage(a).label.localeCompare(contactStage(b).label)
        : (a: ProspectIndex, b: ProspectIndex) => rowStage(a).localeCompare(rowStage(b)) || byName(a, b)
    case 'campaign': return (a: ProspectIndex, b: ProspectIndex) => campaignName(a).localeCompare(campaignName(b))
    case 'added': return (a: ProspectIndex, b: ProspectIndex) => a.created_at.localeCompare(b.created_at)
  }
}

function sortRows(rows: ProspectIndex[], sort: ProspectSort, dir: 'asc' | 'desc', view: Filter, campaignNames: Map<string, string>): ProspectIndex[] {
  const cmp = comparator(sort, view, campaignNames)
  const d = dir === 'asc' ? 1 : -1
  // Secondary name pass for 'type' so each group reads alphabetically in both
  // directions; then an id tiebreak, without which offset paging over rows that
  // compare equal would skip and duplicate as the user loads more.
  return [...rows].sort((a, b) =>
    cmp(a, b) * d ||
    (sort === 'type' ? byName(a, b) : 0) ||
    a.id.localeCompare(b.id))
}

// ── Pass 2: hydrate one page ─────────────────────────────────────────────────

/** Apply a query to the index and return the matching ids in order, plus the
 * total. Kept separate from hydration so callers can count without reading a
 * single draft body. */
export function selectPage(
  index: ProspectIndex[],
  query: ProspectQuery,
  campaignNames: Map<string, string>,
): { page: ProspectIndex[]; total: number } {
  const stage = query.stage && query.stage !== 'all' ? query.stage : null
  const matching = index.filter(
    (p) =>
      matchesCampaign(p, query.campaignId) &&
      matchesView(p, query.view) &&
      (!stage || stageBucket(p) === stage),
  )
  const ordered = sortRows(matching, query.sort, query.dir, query.view, campaignNames)
  const offset = Math.max(0, query.offset)
  const limit = Math.min(Math.max(1, query.limit), PROSPECT_MAX_LOADED)
  return { page: ordered.slice(offset, offset + limit), total: matching.length }
}

/** Read the full draft rows for these prospects and build the view objects the
 * UI renders. Only the page's prospects are touched — the subject/body/facts
 * that dominate the payload never leave the database for anyone else. */
export async function hydrateProspects(
  supabase: DB,
  companyId: string,
  page: ProspectIndex[],
): Promise<OutreachProspectView[]> {
  if (page.length === 0) return []

  const ids = page.map((p) => p.id)
  const byProspect = new Map<string, DraftRow[]>()
  for (let i = 0; i < ids.length; i += HYDRATE_CHUNK) {
    const chunk = ids.slice(i, i + HYDRATE_CHUNK)
    const { data, error } = await supabase
      .from('outreach_drafts')
      .select('*')
      .eq('company_id', companyId)
      .in('prospect_id', chunk)
    if (error) {
      console.error(`[outreach] draft hydration failed: ${error.message}`)
      continue
    }
    for (const d of data ?? []) {
      const arr = byProspect.get(d.prospect_id)
      if (arr) arr.push(d)
      else byProspect.set(d.prospect_id, [d])
    }
  }

  return page.map((p) => {
    // The index already knows this prospect's touches, their order and their
    // sends; hydration only fills in the copy.
    const rowById = new Map((byProspect.get(p.id) ?? []).map((d) => [d.id, d]))
    const drafts: OutreachDraftView[] = p.drafts.flatMap((idx) => {
      const d = rowById.get(idx.id)
      if (!d) return []
      const facts = asStringArray(d.facts_for_draft)
      return [{
        id: d.id,
        subject: d.subject,
        body: d.body,
        angle: d.angle,
        synthesis_confidence: d.synthesis_confidence,
        clean: d.clean,
        drifted_facts: asStringArray(d.drifted_facts),
        facts_for_draft: facts,
        facts_used: asStringArray(d.facts_used),
        status: d.status,
        step: d.step,
        is_template: facts.length === 0,
        template_id: d.template_id,
        send: idx.send,
      }]
    })

    const raw = p.raw
    const fp = raw.footprint as { award_count?: number; sampled_total?: number } | null
    return {
      id: raw.id,
      email: raw.email,
      domain: raw.domain,
      created_at: raw.created_at,
      status: raw.status,
      skip_stage: raw.skip_stage,
      skip_reason: raw.skip_reason,
      recipient_name: raw.recipient_name,
      // select('*') returns contact_name only once its migration is applied;
      // until then the localpart parse carries the feature alone.
      contact_name: resolveContactName(raw.contact_name ?? null, raw.email),
      contact_name_manual: !!(raw.contact_name ?? null)?.trim(),
      campaign_id: raw.campaign_id ?? null,
      resolution_confidence: raw.resolution_confidence,
      business_types: raw.business_types ?? [],
      location: raw.location,
      footprint: fp && typeof fp.award_count === 'number'
        ? { award_count: fp.award_count, sampled_total: fp.sampled_total ?? 0 }
        : null,
      drafts,
      draft: drafts.at(-1) ?? null,
      disposition: raw.disposition,
      disposition_at: raw.disposition_at,
      reply_from: raw.reply_from,
      reply_subject: raw.reply_subject,
      reply_snippet: raw.reply_snippet,
      thread_id: p.thread_id,
      needs_review: p.needs_review,
    }
  })
}
