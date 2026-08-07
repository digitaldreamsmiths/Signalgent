/**
 * Automatic follow-up sequences — Phase 1 of docs/specs/signalgent-govcon-v1.md.
 *
 * Follow-ups existed but were generated one prospect at a time by hand (the
 * "Generate follow-up" button). This module holds:
 *   - `generateFollowupTouch` — the touch generator, shared by that button and
 *     the cron. Personalized follow-ups reuse the opener's verified facts/angle
 *     (one draft LLM call, no re-enrichment); template follow-ups continue the
 *     opener's variant.
 *   - `runFollowupSweep` — the cron pass: for every open prospect whose touches
 *     are ALL sent, the last one `followup_wait_days` business days ago, and
 *     fewer than `followup_max_touches` total, generate and queue the next one.
 *
 * Auto-approval semantics (the sweep runs with `auto: true`):
 *   - template follow-ups are pre-approved copy → approved + queued (same as
 *     the manual button since Session 29).
 *   - personalized follow-ups are LLM output. CLEAN ones (drift check passed)
 *     auto-approve + queue — the opener's facts were already human-approved and
 *     the drift check re-verifies them. A drafted-but-DRIFTED follow-up lands
 *     in "To review" instead, which also pauses the sequence for that prospect
 *     until a human decides.
 *
 * Plain module (NOT 'use server'), same split as worker.ts: runs under the
 * user-scoped server actions and the unauthenticated cron.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { draftEmail } from './draft'
import { buildTemplateFollowup } from './template'
import { loadOfferProfile } from './offer-profile'
import { applyGreeting, fetchStoredContactNames, resolveContactName } from './contact-name'
import { autoQueueDraftSend } from './send/queue'
import { loadSettings } from './send/worker'
import { fetchAllPages } from './fetch-all'
import { recordUsage } from './enrich-run'
import type { SynthesisResult } from './types'
import type { LLMUsage } from '../../llm/client'

type DB = SupabaseClient<Database>

/** Follow-up ceiling per cron tick per company — bounds LLM cost and runtime. */
const SWEEP_BATCH = 15

/** Don't resurrect stale threads: a "just checking in" nudge on a months-old
 * cold email reads as spam. Prospects whose last touch is older than this are
 * left alone even with follow-ups enabled. */
const MAX_AGE_DAYS = 45

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** Whole business days (Mon–Fri, UTC) elapsed from `from` to `to`. */
export function businessDaysSince(from: Date, to: Date): number {
  if (to <= from) return 0
  let days = 0
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  // Bounded: nothing in the sweep looks back further than ~MAX_AGE_DAYS.
  for (let guard = 0; guard < 400 && cursor.getTime() < end; guard++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    const dow = cursor.getUTCDay()
    if (dow !== 0 && dow !== 6) days++
  }
  return days
}

export interface TouchResult {
  ok: boolean
  /** 'queued' = approved + in the send queue; 'review' = drafted but awaiting
   * human approval; 'skipped'/'error' carry a reason. */
  outcome: 'queued' | 'review' | 'skipped' | 'error'
  reason?: string
}

/**
 * Generate the next touch for one prospect. `auto` selects the sweep's
 * approval semantics (see module docs); the manual button passes false and
 * keeps personalized follow-ups in review unconditionally.
 */
export async function generateFollowupTouch(
  supabase: DB,
  companyId: string,
  prospectId: string,
  opts: { userId: string | null; auto: boolean },
): Promise<TouchResult> {
  const { data: p } = await supabase
    .from('outreach_prospects')
    .select('id, recipient_name, email, disposition')
    .eq('id', prospectId)
    .eq('company_id', companyId)
    .single()
  if (!p) return { ok: false, outcome: 'error', reason: 'Prospect not found.' }
  if (p.disposition !== 'open') {
    return { ok: false, outcome: 'skipped', reason: 'This prospect is closed (replied, bounced, or unsubscribed). Reopen it to add a follow-up.' }
  }

  const { data: existing } = await supabase
    .from('outreach_drafts')
    .select('subject, angle, synthesis_confidence, facts_for_draft, step')
    .eq('prospect_id', prospectId)
    .eq('company_id', companyId)
    .order('step', { ascending: true })
  if (!existing || existing.length === 0) {
    return { ok: false, outcome: 'error', reason: 'No initial draft to follow up on yet.' }
  }

  const nextStep = Math.max(...existing.map((d) => d.step)) + 1
  const priorSubject = existing[existing.length - 1].subject
  // Reuse the verified facts/angle from the personalized touch when there is one.
  const personalized = existing.find((d) => asStringArray(d.facts_for_draft).length > 0)

  const profile = await loadOfferProfile(supabase, companyId)
  const storedNames = await fetchStoredContactNames(supabase, companyId, [prospectId])
  const contactName = resolveContactName(storedNames.get(prospectId), p.email)
  const usage: LLMUsage[] = []
  let row: {
    subject: string
    body: string
    angle: string | null
    synthesis_confidence: number | null
    facts_for_draft: string[]
    facts_used: string[]
    drifted_facts: string[]
    clean: boolean
  }

  if (personalized) {
    const facts = asStringArray(personalized.facts_for_draft)
    const synthesis: SynthesisResult = {
      skip: false,
      skip_reason: null,
      confidence: personalized.synthesis_confidence ?? 1,
      angle: personalized.angle,
      facts_for_draft: facts,
    }
    const review = await draftEmail(synthesis, usage, { step: nextStep, priorSubject }, profile)
    if (!review) return { ok: false, outcome: 'error', reason: 'Could not draft a follow-up. Try again.' }
    row = {
      subject: review.draft.subject,
      body: applyGreeting(review.draft.body, contactName),
      angle: personalized.angle,
      synthesis_confidence: personalized.synthesis_confidence,
      facts_for_draft: facts,
      facts_used: review.draft.facts_used,
      drifted_facts: review.drifted_facts,
      clean: review.clean,
    }
  } else {
    // Same seed as the opener, so the nudge continues that variant's question
    // rather than opening an unrelated one.
    const tmpl = buildTemplateFollowup(p.recipient_name ?? null, prospectId, profile)
    row = {
      subject: tmpl.subject,
      body: applyGreeting(tmpl.body, contactName),
      angle: null,
      synthesis_confidence: null,
      facts_for_draft: [],
      facts_used: [],
      drifted_facts: [],
      clean: true,
    }
  }

  // Approval: templates are pre-approved copy → straight to the queue. A
  // personalized follow-up auto-approves only from the sweep AND only when the
  // drift check passed; the manual button always leaves it for review.
  const autoApprove = !personalized || (opts.auto && row.clean)
  const { data: created, error } = await supabase
    .from('outreach_drafts')
    .insert({
      prospect_id: prospectId,
      company_id: companyId,
      step: nextStep,
      status: autoApprove ? 'approved' : 'pending',
      ...row,
    })
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, outcome: 'error', reason: 'Could not save the follow-up.' }
  if (autoApprove && created) await autoQueueDraftSend(supabase, companyId, created.id)

  if (usage.length > 0) await recordUsage(supabase, companyId, opts.userId, usage)
  return { ok: true, outcome: autoApprove ? 'queued' : 'review' }
}

interface ProspectTouchState {
  count: number
  allSent: boolean
}

/**
 * Pure candidate filter, split out for unit testing: which prospects are due a
 * follow-up given their touch state and last-send timestamp.
 */
export function selectFollowupCandidates(
  touchState: Map<string, ProspectTouchState>,
  lastSentAt: Map<string, string>,
  opts: { waitDays: number; maxTouches: number; now: Date },
): string[] {
  const out: string[] = []
  for (const [prospectId, st] of touchState) {
    if (!st.allSent || st.count === 0 || st.count >= opts.maxTouches) continue
    const sentIso = lastSentAt.get(prospectId)
    if (!sentIso) continue
    const sent = new Date(sentIso)
    const elapsed = businessDaysSince(sent, opts.now)
    const ageDays = (opts.now.getTime() - sent.getTime()) / 86_400_000
    if (elapsed >= opts.waitDays && ageDays <= MAX_AGE_DAYS) out.push(prospectId)
  }
  return out
}

export interface SweepResult {
  candidates: number
  queued: number
  review: number
  errors: number
  skipped?: string
}

/** One cron pass over a company. No-ops unless sending AND follow-ups are on. */
export async function runFollowupSweep(supabase: DB, companyId: string): Promise<SweepResult> {
  const settings = await loadSettings(supabase, companyId)
  if (!settings.active) return { candidates: 0, queued: 0, review: 0, errors: 0, skipped: 'sending off' }
  if (!settings.followup_enabled) return { candidates: 0, queued: 0, review: 0, errors: 0, skipped: 'follow-ups off' }

  // Touch state per prospect. Paged: drafts outgrow the silent 1,000-row cap.
  const drafts = await fetchAllPages((from, to) =>
    supabase
      .from('outreach_drafts')
      .select('prospect_id, status')
      .eq('company_id', companyId)
      .order('id')
      .range(from, to),
  )
  const touchState = new Map<string, ProspectTouchState>()
  for (const d of drafts) {
    const st = touchState.get(d.prospect_id) ?? { count: 0, allSent: true }
    st.count += 1
    // 'exported' = sent (or hand-marked sent). Anything else — pending,
    // approved, edited, rejected — means the sequence is either mid-flight or
    // parked on a human decision; both stall further touches.
    if (d.status !== 'exported') st.allSent = false
    touchState.set(d.prospect_id, st)
  }

  // Latest sent timestamp per prospect.
  const sends = await fetchAllPages((from, to) =>
    supabase
      .from('outreach_sends')
      .select('prospect_id, sent_at')
      .eq('company_id', companyId)
      .eq('status', 'sent')
      .not('sent_at', 'is', null)
      .order('id')
      .range(from, to),
  )
  const lastSentAt = new Map<string, string>()
  for (const s of sends) {
    const cur = lastSentAt.get(s.prospect_id)
    if (!cur || (s.sent_at as string) > cur) lastSentAt.set(s.prospect_id, s.sent_at as string)
  }

  const due = selectFollowupCandidates(touchState, lastSentAt, {
    waitDays: settings.followup_wait_days,
    maxTouches: settings.followup_max_touches,
    now: new Date(),
  })
  if (due.length === 0) return { candidates: 0, queued: 0, review: 0, errors: 0 }

  // Suppression re-check happens inside generateFollowupTouch (disposition must
  // still be open), so closed prospects among the due set just skip.
  let queued = 0
  let review = 0
  let errors = 0
  for (const prospectId of due.slice(0, SWEEP_BATCH)) {
    try {
      const r = await generateFollowupTouch(supabase, companyId, prospectId, { userId: null, auto: true })
      if (r.outcome === 'queued') queued++
      else if (r.outcome === 'review') review++
      else if (r.outcome === 'error') errors++
    } catch (err) {
      errors++
      console.error(`[followup-sweep] prospect ${prospectId}: ${err instanceof Error ? err.message : err}`)
    }
  }
  return { candidates: due.length, queued, review, errors }
}
