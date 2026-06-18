/**
 * Shared types for the outreach pipeline (Stages 1–3).
 *
 * The contract that matters: Stage 2 emits `facts_for_draft[]`, and Stage 3 may
 * use NOTHING else. `facts_used[]` echoed on the draft lets us auto-reject any
 * draft that drifted from the approved facts.
 */

import type { ContractorProfile } from '../usaspending/contractor'

/** Output of Stage 1 enrichment — the raw signals available to synthesis. */
export interface EnrichedTarget {
  email: string
  domain: string
  recipient_name: string
  recipient_id: string
  /** Resolver confidence (0..1) that this identity is the domain's owner. */
  resolution_confidence: number
  resolution_method: 'heuristic' | 'ai_judge'
  /** Award footprint (size/recency signal). Agency/NAICS rollups may be thin. */
  footprint: ContractorProfile
  /** Recipient-level socioeconomic flags (the reliable personalization source). */
  business_types: string[]
  uei: string | null
  /** Single-line verified address for CAN-SPAM corroboration. */
  location: string | null
}

/** Output of Stage 2 synthesis. */
export interface SynthesisResult {
  /** True → route to skip pile, do not draft. */
  skip: boolean
  skip_reason: string | null
  /** 0..1 fit confidence for the chosen angle. */
  confidence: number
  /** The single bridge: one procurement signal ↔ one proposal pain point. */
  angle: string | null
  /** The ONLY facts Stage 3 may use. Atomic, verifiable statements. */
  facts_for_draft: string[]
}

/** Output of Stage 3 draft. */
export interface DraftResult {
  subject: string
  body: string
  /** Which facts_for_draft items the draft actually used. Subset, or it drifted. */
  facts_used: string[]
}

/** Result of the deterministic drift check applied after Stage 3. */
export interface DraftReview {
  draft: DraftResult
  /** facts_used entries that were NOT in facts_for_draft → hallucination signal. */
  drifted_facts: string[]
  /** True when no drift detected. */
  clean: boolean
}

// ── Server-action result + review-queue view types ───────────────────────────
// These live here (not in actions.ts) because a 'use server' module may export
// ONLY async functions — types must be defined outside it.

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export interface OutreachDraftView {
  id: string
  subject: string
  body: string
  angle: string | null
  synthesis_confidence: number | null
  clean: boolean
  drifted_facts: string[]
  facts_for_draft: string[]
  facts_used: string[]
  status: 'pending' | 'approved' | 'edited' | 'rejected' | 'exported'
  /** 1 = initial email, 2+ = follow-up touches. */
  step: number
  /** True for the generic fallback (no facts) vs. a personalized draft. */
  is_template: boolean
  /** The latest send attempt for this draft, if any. */
  send: OutreachSendView | null
}

export type SendStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'canceled'

export interface OutreachSendView {
  id: string
  status: SendStatus
  scheduled_at: string | null
  sent_at: string | null
  error: string | null
}

/** Per-company sender identity + drip controls. */
export interface SendSettings {
  sender_name: string | null
  sender_email: string | null
  reply_to: string | null
  daily_send_limit: number
  send_window_start: string
  send_window_end: string
  timezone: string
  min_gap_minutes: number
  signature: string | null
  physical_address: string | null
  unsubscribe_line: string | null
  provider: 'dry_run' | 'gmail' | 'resend'
  active: boolean
}

/** Outcome of the whole conversation (recorded manually after send). A
 * non-`open` disposition closes the prospect and suppresses follow-ups. */
export type Disposition = 'open' | 'interested' | 'not_interested' | 'bounced' | 'unsubscribed'

export interface OutreachProspectView {
  id: string
  email: string
  domain: string | null
  status: 'new' | 'enriched' | 'skipped' | 'drafted' | 'error'
  skip_stage: string | null
  skip_reason: string | null
  recipient_name: string | null
  resolution_confidence: number | null
  business_types: string[]
  location: string | null
  footprint: { award_count: number; sampled_total: number } | null
  /** All touches for this prospect, ordered by step (1 = initial). */
  drafts: OutreachDraftView[]
  /** The latest touch (highest step), or null. Drives the queue/list/filters. */
  draft: OutreachDraftView | null
  disposition: Disposition
  disposition_at: string | null
  /** Resolver found a plausible-but-uncertain match (low confidence) — surface
   * for manual disambiguation rather than silent skip. */
  needs_review: boolean
}

export interface OutreachSnapshot {
  prospects: OutreachProspectView[]
  counts: {
    total: number
    new: number
    /** Prospects with a personalized (facts-backed) draft. */
    personalized: number
    /** Prospects with the generic fallback template. */
    templates: number
    /** Drafts (either kind) marked approved. */
    approved: number
    /** Drafts marked exported (downloaded + sent). */
    exported: number
    /** Prospects flagged for manual disambiguation. */
    needs_review: number
    /** Prospects whose draft has been exported (== sent to the sending tool). */
    sent: number
    /** Prospects that replied (interested + not_interested). */
    replied: number
    /** Prospects marked bounced. */
    bounced: number
    /** Prospects marked unsubscribed. */
    unsubscribed: number
    /** Sends currently waiting in the drip queue. */
    queued: number
  }
  /** replied / sent, as a fraction (0 when nothing sent). */
  reply_rate: number
  /** All-time Anthropic API spend for this company's outreach ($). */
  cost_usd_total: number
}
