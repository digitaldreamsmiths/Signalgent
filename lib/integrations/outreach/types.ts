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
  /** True for the generic fallback (no facts) vs. a personalized draft. */
  is_template: boolean
}

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
  draft: OutreachDraftView | null
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
  }
}
