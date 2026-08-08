/**
 * Shared prospect predicates — which view a prospect belongs to, what lifecycle
 * stage it is at, and how the lists sort.
 *
 * These used to live in the workspace component and run over the full prospect
 * array in the browser. Paging moved filtering/sorting/counting to the server,
 * so the rules have to be usable from both sides — hence a plain module with
 * STRUCTURAL parameter types: the server's lean index rows and the client's
 * fully-hydrated `OutreachProspectView` both satisfy them, so there is exactly
 * one definition of "is this prospect in To review" and it can't drift.
 */

import type { Filter, StageBucket } from './views'
import type { Disposition, SendStatus } from './types'

const ACCENT = '#D85A30'
const MUTED = 'var(--app-muted)'

/** The draft fields every predicate here needs. `OutreachDraftView` is a superset. */
export interface DraftLike {
  status: 'pending' | 'approved' | 'edited' | 'rejected' | 'exported'
  step: number
  is_template: boolean
  send: { status: SendStatus } | null
}

/** The prospect fields every predicate here needs. `OutreachProspectView` is a superset. */
export interface ProspectLike {
  id: string
  email: string
  domain: string | null
  created_at: string
  status: 'new' | 'enriched' | 'skipped' | 'drafted' | 'error'
  recipient_name: string | null
  campaign_id: string | null
  disposition: Disposition
  needs_review: boolean
  /** All touches, ordered by step. */
  drafts: DraftLike[]
  /** The latest touch (highest step), or null. */
  draft: DraftLike | null
}

// ── View membership ──────────────────────────────────────────────────────────

/** Does this prospect belong in `view`? One definition, used by the page query,
 * the per-view counts, and the nav badges. `scheduled` renders from the queued
 * send list rather than from prospects, so nothing matches it. */
export function matchesView(p: ProspectLike, view: Filter): boolean {
  switch (view) {
    case 'contacts': return true
    case 'review': return !!p.draft && !p.draft.is_template && p.draft.status === 'pending'
    case 'templates': return !!p.draft && p.draft.is_template && p.draft.status === 'pending' && !p.needs_review
    case 'needs_review': return p.needs_review
    case 'approved': return !!p.draft && (p.draft.status === 'approved' || p.draft.status === 'edited')
    case 'exported': return !!p.draft && p.draft.status === 'exported'
    case 'replied': return p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested'
    case 'bounced': return p.disposition === 'bounced' || p.disposition === 'unsubscribed'
    case 'scheduled': return false
    case 'all': return !!p.draft
  }
}

/** 'all' = everything, 'none' = the campaign-less pool, else a campaign id. */
export function matchesCampaign(p: ProspectLike, campaignId: string): boolean {
  if (campaignId === 'all') return true
  if (campaignId === 'none') return !p.campaign_id
  return p.campaign_id === campaignId
}

// ── Lifecycle stage ──────────────────────────────────────────────────────────

/** Collapse a prospect's full lifecycle — enrichment status + latest draft +
 * send + disposition — into a single badge for the Contacts list. More advanced /
 * terminal states win, so a row reads as the furthest point it has reached. */
export function contactStage(p: ProspectLike): { label: string; color: string } {
  if (p.disposition === 'bounced') return { label: 'Bounced', color: '#b04545' }
  if (p.disposition === 'unsubscribed') return { label: 'Opt-out ✋', color: '#b04545' }
  if (p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested') return { label: 'Replied', color: '#378ADD' }
  if (p.needs_review) return { label: 'Needs review', color: '#e0a060' }

  // Emailed = any touch actually sent or marked exported to the sending tool.
  if (p.drafts.some((d) => d.status === 'exported' || d.send?.status === 'sent')) return { label: 'Emailed', color: '#378ADD' }

  const send = p.draft?.send
  if (send?.status === 'sending') return { label: 'Sending', color: ACCENT }
  if (send?.status === 'queued') return { label: 'Queued', color: ACCENT }

  const ds = p.draft?.status
  if (ds === 'approved' || ds === 'edited') return { label: 'Ready to email', color: '#1D9E75' }
  if (ds === 'rejected') return { label: 'Rejected', color: '#BA7517' }
  if (ds === 'pending') return p.draft!.is_template ? { label: 'Template', color: MUTED } : { label: 'In review', color: '#1D9E75' }

  switch (p.status) {
    case 'skipped': return { label: 'Skipped', color: '#BA7517' }
    case 'error': return { label: 'Error', color: '#b04545' }
    case 'enriched': return { label: 'Enriched', color: '#378ADD' }
    case 'drafted': return { label: 'Drafted', color: '#1D9E75' }
    default: return { label: 'New', color: MUTED }
  }
}

/** Coarse bucket for the Contacts status filter (the label from contactStage is
 * finer-grained than the filter needs). */
export function stageBucket(p: ProspectLike): StageBucket {
  if (p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested') return 'replied'
  if (p.disposition === 'bounced' || p.disposition === 'unsubscribed') return 'other'
  if (p.needs_review) return 'review'
  if (p.drafts.some((d) => d.status === 'exported' || d.send?.status === 'sent')) return 'emailed'
  const send = p.draft?.send
  if (send?.status === 'queued' || send?.status === 'sending') return 'ready'
  const ds = p.draft?.status
  if (ds === 'approved' || ds === 'edited') return 'ready'
  if (ds === 'pending') return p.draft!.is_template ? 'other' : 'review'
  if (p.status === 'new') return 'new'
  return 'other'
}

/** Row state for the draft lists' Status sort — the send status once queued,
 * else the draft status, so queued rows group together ahead of un-scheduled ones. */
export function rowStage(p: ProspectLike): string {
  return p.draft?.send?.status ?? p.draft?.status ?? ''
}

/** A draft the scheduler would actually take: no send yet, or only a
 * failed/canceled attempt. Mirrors `scheduleDraftSends`. */
export function isUnqueued(d: DraftLike | null): boolean {
  return !!d && (!d.send || d.send.status === 'failed' || d.send.status === 'canceled')
}

// ── Sorting ──────────────────────────────────────────────────────────────────

export function displayName(p: ProspectLike): string {
  return p.recipient_name ?? p.domain ?? p.email
}

export const byName = (a: ProspectLike, b: ProspectLike) =>
  displayName(a).localeCompare(displayName(b))
