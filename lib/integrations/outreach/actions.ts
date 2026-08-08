'use server'

/**
 * Server actions for the outreach review queue (Marketing mode).
 *
 * Every action enforces requireCompanyAccess(companyId) before touching data.
 * Mirrors the comms/assist discriminated-result convention so the widget can
 * render success / friendly-error inline.
 *
 * Send is OUT OF SCOPE — there is no send action here on purpose. Approved
 * drafts are exported to the dedicated cold-email platform out of band.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import { extractDomain } from '../usaspending/resolve'
import { runPipelineFromName } from './pipeline'
import { persistOutcome, recordUsage, runEnrichmentBatch, runEnrichmentBatchForIds, enrichToBuffer, RUN_BATCH } from './enrich-run'
import { loadSettings, getEffectiveDailyCap, todayBounds, warmupDayIndex } from './send/worker'
import { generateFollowupTouch } from './followups'
import { loadOfferProfile } from './offer-profile'
import { fetchStoredContactNames, resolveContactName } from './contact-name'
import { loadCampaigns } from './campaigns'
import { effectiveLimits, loadBilling, planDailySendCap } from '@/lib/billing/billing'
import { openStats, recentBounceStats } from './send/scan'
import { getAccount } from '../accounts'
import { undeliverableDomains } from './deliverability'
import { fetchAllPages } from './fetch-all'
import {
  campaignStats,
  companyCounts,
  countStageBuckets,
  countUntriaged,
  countViews,
  hydrateProspects,
  loadOutreachIndex,
  selectPage,
  templateStats,
} from './query'
import type { LLMUsage } from '../../llm/client'
import type {
  ActionResult,
  Disposition,
  OutreachSnapshot,
  OutreachWorkspaceData,
  ProspectQuery,
} from './types'

const AUTH_ERROR = 'You don’t have access to this workspace.'


// ── Ingest ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g

export async function ingestProspects(
  companyId: string,
  raw: string,
  /** Campaign the new prospects join. Omit/null = the campaign-less pool. */
  campaignId?: string | null,
): Promise<ActionResult<{ added: number; duplicates: number; invalid: number; undeliverable: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }

  const matches = raw.match(EMAIL_RE) ?? []
  const seen = new Set<string>()
  const rows: { company_id: string; email: string; domain: string | null; status: 'new'; campaign_id?: string }[] = []
  let invalid = 0
  for (const m of matches) {
    const email = m.trim().toLowerCase()
    if (seen.has(email)) continue
    seen.add(email)
    const domain = extractDomain(email)
    if (!domain) {
      invalid += 1
      continue
    }
    rows.push({ company_id: companyId, email, domain, status: 'new', ...(campaignId ? { campaign_id: campaignId } : {}) })
  }

  if (rows.length === 0) {
    return { ok: true, data: { added: 0, duplicates: 0, invalid, undeliverable: 0 } }
  }

  // Deliverability: drop domains that definitively can't receive mail (no MX and
  // no A record), so dead addresses never reach enrichment or the sending tool.
  const bad = await undeliverableDomains(rows.map((r) => r.domain).filter((d): d is string => !!d))
  const sendable = rows.filter((r) => !r.domain || !bad.has(r.domain))
  const undeliverable = rows.length - sendable.length

  if (sendable.length === 0) {
    return { ok: true, data: { added: 0, duplicates: 0, invalid, undeliverable } }
  }

  const supabase = await createClient()

  // Plan ceiling on stored prospects. Checked before the insert so the user
  // gets a clear message instead of a silent partial add.
  const billing = await loadBilling(supabase, companyId)
  const { maxProspects } = effectiveLimits(billing)
  if (Number.isFinite(maxProspects)) {
    const { count: existing } = await supabase
      .from('outreach_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
    if ((existing ?? 0) + sendable.length > maxProspects) {
      const room = Math.max(0, maxProspects - (existing ?? 0))
      return {
        ok: false,
        error: room === 0
          ? `Your plan holds ${maxProspects.toLocaleString('en-US')} prospects and you're at the limit. Delete some, or move up a plan.`
          : `That would exceed your plan's ${maxProspects.toLocaleString('en-US')}-prospect limit — room for ${room.toLocaleString('en-US')} more.`,
      }
    }
  }

  // Insert, ignoring rows that already exist (unique company_id+email).
  let { data, error } = await supabase
    .from('outreach_prospects')
    .upsert(sendable, { onConflict: 'company_id,email', ignoreDuplicates: true })
    .select('id')

  // campaign_id arrives via an out-of-band migration; until it's applied,
  // retry the ingest without it rather than blocking adds entirely.
  if (error && campaignId && /campaign_id/.test(error.message)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const stripped = sendable.map(({ campaign_id, ...rest }) => rest)
    ;({ data, error } = await supabase
      .from('outreach_prospects')
      .upsert(stripped, { onConflict: 'company_id,email', ignoreDuplicates: true })
      .select('id'))
  }

  if (error) return { ok: false, error: 'Could not save prospects. Try again.' }

  const added = data?.length ?? 0
  revalidatePath('/outreach')
  return { ok: true, data: { added, duplicates: sendable.length - added, invalid, undeliverable } }
}

// ── Run the pipeline over new prospects ───────────────────────────────────────

export async function runNewProspects(
  companyId: string,
  limit: number = RUN_BATCH,
): Promise<ActionResult<{ processed: number; drafted: number; skipped: number; remaining: number; cost_usd: number }>> {
  let access: Awaited<ReturnType<typeof requireCompanyAccess>>
  try {
    access = await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }

  const supabase = await createClient()
  const data = await runEnrichmentBatch(supabase, companyId, limit, access.userId)
  revalidatePath('/outreach')
  return { ok: true, data }
}

/** Enrich a caller-selected set of `new` prospects right now, bypassing the wave
 * buffer cap. Powers the Contacts tab's "Process (N)" bulk action: the client
 * loops one RUN_BATCH at a time (shrinking `prospectIds` by `processedIds`), so a
 * large selection drains progressively and the "To review" queue fills as each
 * batch lands, instead of being throttled by the drip pacing. */
export async function processProspects(
  companyId: string,
  prospectIds: string[],
  limit: number = RUN_BATCH,
): Promise<ActionResult<{ processed: number; drafted: number; skipped: number; remaining: number; cost_usd: number; processedIds: string[] }>> {
  let access: Awaited<ReturnType<typeof requireCompanyAccess>>
  try {
    access = await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (prospectIds.length === 0) {
    return { ok: true, data: { processed: 0, drafted: 0, skipped: 0, remaining: 0, cost_usd: 0, processedIds: [] } }
  }
  const supabase = await createClient()
  const data = await runEnrichmentBatchForIds(supabase, companyId, prospectIds, limit, access.userId)
  revalidatePath('/outreach')
  return { ok: true, data }
}

/** Enrich one wave: top up the enriched-and-ready buffer to ~3 days of send
 * capacity. The "Enrich wave" button and the cron both use this — enrichment is
 * intentionally incremental so federal-award facts stay fresh. */
export async function enrichWaveNow(
  companyId: string,
): Promise<ActionResult<{ enriched: number; drafted: number; skipped: number; remaining: number; cost_usd: number; note?: string }>> {
  let access: Awaited<ReturnType<typeof requireCompanyAccess>>
  try {
    access = await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const data = await enrichToBuffer(supabase, companyId, access.userId)
  revalidatePath('/outreach')
  return { ok: true, data }
}

// ── Workspace read ────────────────────────────────────────────────────────────

/**
 * The whole outreach workspace: fixed-size metrics + counts, plus ONE PAGE of
 * the requested view.
 *
 * This used to be `getOutreachSnapshot`, which returned every prospect, touch
 * and send — ~4,900 prospects on SourceGent — on mount and again on the ~150s
 * poll, leaving the browser to filter, count and sort all of it. Filtering,
 * counting and sorting now happen here (see `query.ts`); the response carries
 * `query.limit` rows.
 *
 * Snapshot and page come from one index pass, so a refresh is one query set
 * rather than two.
 */
export async function getOutreachWorkspace(
  companyId: string,
  query: ProspectQuery,
): Promise<OutreachWorkspaceData | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }

  const supabase = await createClient()
  const [index, usageRows, campaigns] = await Promise.all([
    loadOutreachIndex(supabase, companyId),
    fetchAllPages((from, to) =>
      supabase.from('api_usage').select('cost_usd').eq('company_id', companyId).like('feature', 'outreach:%')
        .order('id').range(from, to)),
    loadCampaigns(supabase, companyId),
  ])

  const cost_usd_total = (usageRows ?? []).reduce((s, r) => s + (r.cost_usd ?? 0), 0)

  const counts = companyCounts(index.rows, index.queued)
  const reply_rate = counts.sent > 0 ? counts.replied / counts.sent : 0

  const campaignNames = new Map(campaigns.map((c) => [c.id, c.name]))
  const { page, total } = selectPage(index.rows, query, campaignNames)
  const rows = await hydrateProspects(supabase, companyId, page)

  const settings = await loadSettings(supabase, companyId)
  const { rate: bounce_rate_7d } = await recentBounceStats(supabase, companyId, 7)
  const opens = await openStats(supabase, companyId)
  // Gmail health: token refresh failures mark the account 'error', which makes
  // the worker/scanner silently skip — surface it so the user can reconnect.
  let gmail: OutreachSnapshot['sending']['gmail'] = null
  if (settings.provider === 'gmail') {
    const account = await getAccount(companyId, 'gmail')
    gmail = account
      ? { status: account.status, last_error: account.last_error }
      : { status: 'not_connected', last_error: null }
  }
  // Today's send count, measured over the same timezone-local day the cap is,
  // so "12 / 25" always reconciles with why the queue did or didn't move.
  const { startIso, endIso } = todayBounds(settings)
  const { count: sentToday } = await supabase
    .from('outreach_sends')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .gte('sent_at', startIso)
    .lt('sent_at', endIso)

  const sending = {
    active: settings.active,
    sender_email: settings.sender_email,
    pause_reason: settings.pause_reason,
    effective_daily_cap: getEffectiveDailyCap(settings, new Date(), await planDailySendCap(supabase, companyId)),
    daily_send_limit: settings.daily_send_limit,
    sent_today: sentToday ?? 0,
    warmup_day: warmupDayIndex(settings),
    bounce_rate_7d,
    provider: settings.provider,
    gmail,
  }

  return {
    snapshot: {
      campaigns,
      views: countViews(index.rows, query.campaignId, index.queued),
      inbox_untriaged: countUntriaged(index.rows, query.campaignId),
      contact_buckets: countStageBuckets(index.rows, query.campaignId),
      campaign_stats: campaignStats(index.rows),
      template_stats: templateStats(index.rows),
      counts,
      reply_rate,
      opens,
      cost_usd_total,
      sending,
    },
    page: { rows, total, offset: Math.max(0, query.offset) },
  }
}

// ── Outcomes ──────────────────────────────────────────────────────────────────

/** Record the conversation outcome for a prospect (manual, post-send). A
 * non-'open' disposition closes the prospect and suppresses follow-ups. */
export async function setDisposition(
  companyId: string,
  prospectId: string,
  disposition: Disposition,
): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_prospects')
    .update({ disposition, disposition_at: disposition === 'open' ? null : new Date().toISOString() })
    .eq('id', prospectId)
    .eq('company_id', companyId)
  if (error) return { ok: false, error: 'Could not update the outcome.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

/** Set (or clear, with an empty string) the person-name override used in
 * greetings. Applies to NEW drafts — existing drafts keep their baked greeting. */
export async function setContactName(companyId: string, prospectId: string, name: string): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_prospects')
    .update({ contact_name: name.trim() || null })
    .eq('id', prospectId)
    .eq('company_id', companyId)
  if (error) {
    const missing = /contact_name/.test(error.message) && /(not exist|not find|schema cache)/i.test(error.message)
    return { ok: false, error: missing ? 'The contact-name migration hasn’t been applied to the database yet.' : 'Could not save the contact name.' }
  }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

/** Permanently delete prospects (cascades to their drafts + sends). */
export async function deleteProspects(
  companyId: string,
  prospectIds: string[],
): Promise<ActionResult<{ deleted: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (prospectIds.length === 0) return { ok: true, data: { deleted: 0 } }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outreach_prospects')
    .delete()
    .eq('company_id', companyId)
    .in('id', prospectIds)
    .select('id')
  if (error) return { ok: false, error: 'Could not delete the prospects.' }
  revalidatePath('/outreach')
  return { ok: true, data: { deleted: data?.length ?? 0 } }
}

// ── Follow-ups ────────────────────────────────────────────────────────────────

/**
 * Generate the next touch (follow-up) for a prospect on demand. Reuses the
 * prospect's already-verified facts/angle from the initial personalized draft
 * (no re-enrichment, no re-synthesis — one Sonnet draft call), or a generic
 * follow-up template when the prospect was never personalized. Blocked once the
 * prospect is closed (replied / bounced / unsubscribed).
 */
export async function generateFollowup(companyId: string, prospectId: string): Promise<ActionResult> {
  let access: Awaited<ReturnType<typeof requireCompanyAccess>>
  try {
    access = await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }

  const supabase = await createClient()
  // auto: false — a hand-triggered personalized follow-up always goes to
  // review; only the cron sweep auto-approves clean ones.
  const r = await generateFollowupTouch(supabase, companyId, prospectId, { userId: access.userId, auto: false })
  if (!r.ok) return { ok: false, error: r.reason ?? 'Could not generate the follow-up.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

// ── Review actions ────────────────────────────────────────────────────────────

async function setDraftStatus(
  companyId: string,
  draftId: string,
  patch: { status: 'approved' | 'edited' | 'rejected'; subject?: string; body?: string },
): Promise<ActionResult> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('outreach_drafts')
    .update({ ...patch, reviewed_at: new Date().toISOString() })
    .eq('id', draftId)
    .eq('company_id', companyId)
  if (error) return { ok: false, error: 'Could not update the draft.' }
  revalidatePath('/outreach')
  return { ok: true, data: undefined }
}

export async function approveDraft(companyId: string, draftId: string): Promise<ActionResult> {
  return setDraftStatus(companyId, draftId, { status: 'approved' })
}

/** Bulk-approve the given draft ids (e.g. all pending templates, or all to-review). */
export async function approveDrafts(
  companyId: string,
  draftIds: string[],
): Promise<ActionResult<{ count: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (draftIds.length === 0) return { ok: true, data: { count: 0 } }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outreach_drafts')
    .update({ status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .in('id', draftIds)
    .select('id')
  if (error) return { ok: false, error: 'Could not approve the drafts.' }
  revalidatePath('/outreach')
  return { ok: true, data: { count: data?.length ?? 0 } }
}

/** Move approved drafts to 'exported' (downloaded + sent) so Approved stays lean. */
export async function markExported(
  companyId: string,
  draftIds: string[],
): Promise<ActionResult<{ count: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  if (draftIds.length === 0) return { ok: true, data: { count: 0 } }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('outreach_drafts')
    .update({ status: 'exported', reviewed_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .in('id', draftIds)
    .select('id')
  if (error) return { ok: false, error: 'Could not mark the drafts exported.' }
  revalidatePath('/outreach')
  return { ok: true, data: { count: data?.length ?? 0 } }
}

/** Manual disambiguation: re-run a prospect against an explicit company name. */
export async function resolveManual(
  companyId: string,
  prospectId: string,
  companyName: string,
): Promise<ActionResult<{ status: 'drafted' | 'skipped' }>> {
  let access: Awaited<ReturnType<typeof requireCompanyAccess>>
  try {
    access = await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }
  const name = companyName.trim()
  if (!name) return { ok: false, error: 'Enter a company name to resolve against.' }

  const supabase = await createClient()
  const { data: prospect } = await supabase
    .from('outreach_prospects')
    .select('email')
    .eq('id', prospectId)
    .eq('company_id', companyId)
    .single()
  if (!prospect) return { ok: false, error: 'Prospect not found.' }

  const profile = await loadOfferProfile(supabase, companyId)
  const storedNames = await fetchStoredContactNames(supabase, companyId, [prospectId])
  const usage: LLMUsage[] = []
  const outcome = await runPipelineFromName(prospect.email, name, usage, profile)
  await persistOutcome(supabase, companyId, prospectId, outcome, profile, resolveContactName(storedNames.get(prospectId), prospect.email))
  await recordUsage(supabase, companyId, access.userId, usage)
  revalidatePath('/outreach')
  return { ok: true, data: { status: outcome.status } }
}

export async function rejectDraft(companyId: string, draftId: string): Promise<ActionResult> {
  return setDraftStatus(companyId, draftId, { status: 'rejected' })
}

export async function editDraft(
  companyId: string,
  draftId: string,
  subject: string,
  body: string,
): Promise<ActionResult> {
  const s = subject.trim()
  const b = body.trim()
  if (!s || !b) return { ok: false, error: 'Subject and body cannot be empty.' }
  return setDraftStatus(companyId, draftId, { status: 'edited', subject: s, body: b })
}
