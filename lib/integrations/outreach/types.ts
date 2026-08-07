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
  /** Which user template produced this fallback draft (null = personalized or the
   * built-in default). Drives per-template performance tracking. */
  template_id: string | null
  /** The latest send attempt for this draft, if any. */
  send: OutreachSendView | null
}

/** A user-authored fallback template, rotated among the active set. */
export interface OutreachTemplate {
  id: string
  name: string
  subject: string
  body: string
  /** Relative odds in the random rotation among active templates (>=1). */
  weight: number
  active: boolean
  created_at: string
}

export type SendStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'canceled'

export interface OutreachSendView {
  id: string
  status: SendStatus
  scheduled_at: string | null
  sent_at: string | null
  /** First tracked open (noise-filtered server-side; null = never, or untracked). */
  opened_at: string | null
  error: string | null
}

/** A queued send for the scheduling calendar/list. */
export interface ScheduledSendView {
  id: string
  draft_id: string
  recipient_email: string
  recipient_name: string | null
  scheduled_at: string | null
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
  /** Why sending is off, when active=false: 'manual' (user) or 'bounce_rate'
   * (auto-paused). null when active or never paused. */
  pause_reason: 'manual' | 'bounce_rate' | null
  // Warmup ramp: per-day cap grows from start_per_day by increment_per_day each
  // sending weekday, up to daily_send_limit. Anchored at warmup_started_at.
  warmup_enabled: boolean
  warmup_start_per_day: number
  warmup_increment_per_day: number
  warmup_started_at: string | null
  // Auto-pause: flip sending off when recent bounce rate is too high.
  bounce_pause_enabled: boolean
  bounce_pause_threshold: number
  bounce_pause_window_days: number
  bounce_pause_min_sends: number
  // Automatic follow-up sequences: the cron generates + queues the next touch
  // when the last one has gone followup_wait_days business days without a
  // reply, up to followup_max_touches total touches per prospect.
  followup_enabled: boolean
  followup_wait_days: number
  followup_max_touches: number
}

/** Outcome of the whole conversation. A non-`open` disposition closes the
 * prospect and suppresses follow-ups. `replied` is set automatically by the
 * reply scanner (a neutral "got a response" state) and is then triaged by hand
 * into `interested`/`not_interested`; the rest are recorded manually. */
export type Disposition = 'open' | 'replied' | 'interested' | 'not_interested' | 'bounced' | 'unsubscribed'

export interface OutreachProspectView {
  id: string
  email: string
  domain: string | null
  /** When the prospect was ingested (ISO). Drives the Contacts "Added" column. */
  created_at: string
  status: 'new' | 'enriched' | 'skipped' | 'drafted' | 'error'
  skip_stage: string | null
  skip_reason: string | null
  recipient_name: string | null
  /** Person name for the greeting: the stored manual override when set, else
   * derived from the email localpart, else null. recipient_name is the company. */
  contact_name: string | null
  /** True when contact_name is the stored override rather than the parse. */
  contact_name_manual: boolean
  /** Campaign this prospect belongs to (null = the campaign-less pool). */
  campaign_id: string | null
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
  /** Preview of the latest detected inbound message (reply or bounce), captured
   * by the scanner. null until a reply/bounce lands. Full body stays in Gmail. */
  reply_from: string | null
  reply_subject: string | null
  reply_snippet: string | null
  /** Resolver found a plausible-but-uncertain match (low confidence) — surface
   * for manual disambiguation rather than silent skip. */
  needs_review: boolean
}

export interface OutreachSnapshot {
  prospects: OutreachProspectView[]
  /** The company's campaigns, active first ([] before the migration). */
  campaigns: import('./campaigns').OutreachCampaign[]
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
  /** Opens over TRACKABLE sends only. Sends made before open tracking existed
   * are excluded from the denominator, so `tracked` can be far below `sent`. */
  opens: { tracked: number; opened: number; rate: number }
  /** All-time Anthropic API spend for this company's outreach ($). */
  cost_usd_total: number
  /** Sending health for the header/banner. */
  sending: {
    active: boolean
    pause_reason: 'manual' | 'bounce_rate' | null
    /** Today's effective daily cap (warmup-ramped). */
    effective_daily_cap: number
    /** The configured ceiling the warmup ramp is climbing toward. */
    daily_send_limit: number
    /** Sends completed so far during today (company timezone). */
    sent_today: number
    /** 1-based sending-weekday index into the warmup ramp, or null when warmup
     * is off or already at the full limit. */
    warmup_day: number | null
    /** Bounce rate over the last 7 days, as a fraction. */
    bounce_rate_7d: number
    provider: 'dry_run' | 'gmail' | 'resend'
    /** Gmail connection health (null unless provider is 'gmail'). Anything but
     * 'connected' means sends and reply scans are silently skipped — surface it. */
    gmail: {
      status: 'connected' | 'expired' | 'revoked' | 'error' | 'disconnected' | 'not_connected'
      last_error: string | null
    } | null
  }
}
