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
import type { Database, Json } from '@/lib/types/database.types'
import { extractDomain } from '../usaspending/resolve'
import { runPipeline } from './pipeline'
import { buildTemplateDraft } from './template'
import type {
  ActionResult,
  OutreachDraftView,
  OutreachProspectView,
  OutreachSnapshot,
} from './types'

type ProspectUpdate = Database['public']['Tables']['outreach_prospects']['Update']

const AUTH_ERROR = 'You don’t have access to this workspace.'

/** Max prospects enriched per runNewProspects call (bounds the request time). */
const RUN_BATCH = 15

// ── Ingest ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g

export async function ingestProspects(
  companyId: string,
  raw: string,
): Promise<ActionResult<{ added: number; duplicates: number; invalid: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }

  const matches = raw.match(EMAIL_RE) ?? []
  const seen = new Set<string>()
  const rows: { company_id: string; email: string; domain: string | null; status: 'new' }[] = []
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
    rows.push({ company_id: companyId, email, domain, status: 'new' })
  }

  if (rows.length === 0) {
    return { ok: true, data: { added: 0, duplicates: 0, invalid } }
  }

  const supabase = await createClient()
  // Insert, ignoring rows that already exist (unique company_id+email).
  const { data, error } = await supabase
    .from('outreach_prospects')
    .upsert(rows, { onConflict: 'company_id,email', ignoreDuplicates: true })
    .select('id')

  if (error) return { ok: false, error: 'Could not save prospects. Try again.' }

  const added = data?.length ?? 0
  revalidatePath('/marketing')
  return { ok: true, data: { added, duplicates: rows.length - added, invalid } }
}

// ── Run the pipeline over new prospects ───────────────────────────────────────

export async function runNewProspects(
  companyId: string,
): Promise<ActionResult<{ processed: number; drafted: number; skipped: number; remaining: number }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return { ok: false, error: AUTH_ERROR }
    throw err
  }

  const supabase = await createClient()
  const { data: pending, error } = await supabase
    .from('outreach_prospects')
    .select('id, email')
    .eq('company_id', companyId)
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(RUN_BATCH)

  if (error) return { ok: false, error: 'Could not load prospects.' }
  if (!pending || pending.length === 0) {
    return { ok: true, data: { processed: 0, drafted: 0, skipped: 0, remaining: 0 } }
  }

  let drafted = 0
  let skipped = 0
  for (const p of pending) {
    const outcome = await runPipeline(p.email)
    const enriched = 'enriched' in outcome ? outcome.enriched : undefined

    const prospectUpdate: ProspectUpdate = { enriched_at: new Date().toISOString() }
    if (enriched) {
      prospectUpdate.recipient_name = enriched.recipient_name
      prospectUpdate.recipient_id = enriched.recipient_id
      prospectUpdate.uei = enriched.uei
      prospectUpdate.resolution_confidence = enriched.resolution_confidence
      prospectUpdate.resolution_method = enriched.resolution_method
      prospectUpdate.business_types = enriched.business_types
      prospectUpdate.location = enriched.location
      prospectUpdate.footprint = enriched.footprint as unknown as Json
    }

    if (outcome.status === 'drafted') {
      prospectUpdate.status = 'drafted'
      prospectUpdate.skip_stage = null
      prospectUpdate.skip_reason = null
      await supabase.from('outreach_prospects').update(prospectUpdate).eq('id', p.id).eq('company_id', companyId)
      await supabase.from('outreach_drafts').upsert(
        {
          prospect_id: p.id,
          company_id: companyId,
          subject: outcome.review.draft.subject,
          body: outcome.review.draft.body,
          angle: outcome.synthesis.angle,
          synthesis_confidence: outcome.synthesis.confidence,
          facts_for_draft: outcome.synthesis.facts_for_draft,
          facts_used: outcome.review.draft.facts_used,
          drifted_facts: outcome.review.drifted_facts,
          clean: outcome.review.clean,
          status: 'pending',
        },
        { onConflict: 'prospect_id' },
      )
      drafted += 1
    } else {
      prospectUpdate.status = 'skipped'
      prospectUpdate.skip_stage = outcome.stage
      prospectUpdate.skip_reason = outcome.reason
      await supabase.from('outreach_prospects').update(prospectUpdate).eq('id', p.id).eq('company_id', companyId)
      // Can't personalize -> attach a generic, sendable template (empty
      // facts_for_draft marks it as a template, no fabricated claims).
      const tmpl = buildTemplateDraft(enriched?.recipient_name ?? null)
      await supabase.from('outreach_drafts').upsert(
        {
          prospect_id: p.id,
          company_id: companyId,
          subject: tmpl.subject,
          body: tmpl.body,
          angle: null,
          synthesis_confidence: null,
          facts_for_draft: [],
          facts_used: [],
          drifted_facts: [],
          clean: true,
          status: 'pending',
        },
        { onConflict: 'prospect_id' },
      )
      skipped += 1
    }
  }

  const { count } = await supabase
    .from('outreach_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'new')

  revalidatePath('/marketing')
  return { ok: true, data: { processed: pending.length, drafted, skipped, remaining: count ?? 0 } }
}

// ── Snapshot read ─────────────────────────────────────────────────────────────

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export async function getOutreachSnapshot(companyId: string): Promise<OutreachSnapshot | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }

  const supabase = await createClient()
  const [{ data: prospects }, { data: drafts }] = await Promise.all([
    supabase.from('outreach_prospects').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('outreach_drafts').select('*').eq('company_id', companyId),
  ])

  const draftByProspect = new Map<string, OutreachDraftView>()
  for (const d of drafts ?? []) {
    const facts = asStringArray(d.facts_for_draft)
    draftByProspect.set(d.prospect_id, {
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
      is_template: facts.length === 0,
    })
  }

  const views: OutreachProspectView[] = (prospects ?? []).map((p) => {
    const fp = p.footprint as { award_count?: number; sampled_total?: number } | null
    return {
      id: p.id,
      email: p.email,
      domain: p.domain,
      status: p.status,
      skip_stage: p.skip_stage,
      skip_reason: p.skip_reason,
      recipient_name: p.recipient_name,
      resolution_confidence: p.resolution_confidence,
      business_types: p.business_types ?? [],
      location: p.location,
      footprint: fp && typeof fp.award_count === 'number'
        ? { award_count: fp.award_count, sampled_total: fp.sampled_total ?? 0 }
        : null,
      draft: draftByProspect.get(p.id) ?? null,
    }
  })

  const counts = {
    total: views.length,
    new: views.filter((v) => v.status === 'new').length,
    personalized: views.filter((v) => v.draft && !v.draft.is_template).length,
    templates: views.filter((v) => v.draft && v.draft.is_template).length,
    approved: views.filter((v) => v.draft?.status === 'approved').length,
  }

  return { prospects: views, counts }
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
  revalidatePath('/marketing')
  return { ok: true, data: undefined }
}

export async function approveDraft(companyId: string, draftId: string): Promise<ActionResult> {
  return setDraftStatus(companyId, draftId, { status: 'approved' })
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
