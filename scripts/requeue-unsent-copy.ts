/**
 * One-off prod repair: rewrite every UNSENT outreach draft with the new copy.
 *
 * WHY THIS IS NEEDED
 * `outreach_drafts` stores the copy, and `outreach_sends` stores the composed
 * body once queued. Both were written under the old register, before Session 28.
 * Swapping the rows in `outreach_templates` only changes what FUTURE fallback
 * drafts render from; it does nothing to drafts that already exist. Without
 * this, every already-drafted prospect goes out with the old copy and the old
 * ask, whether it is queued today or queued next month.
 *
 * SCOPE is deliberately every unsent draft, not just the queue. Fixing only the
 * queued rows leaves the approved-but-unqueued and pending drafts as landmines.
 *
 * WHAT IT DOES, per unsent draft:
 *   - template draft (facts_for_draft empty): re-render from the company's
 *     ACTIVE templates, weighted-random, same as enrichment does.
 *   - personalized draft: re-run Stage 3 with the synthesis already stored on
 *     the draft (angle + facts_for_draft). No re-enrichment, no USASpending
 *     calls, so the only cost is one draft LLM call per prospect.
 *   - rewrite the draft row. If it also has a QUEUED send, update that row in
 *     place too: new subject and body, plus open/unsubscribe tokens.
 *     `scheduled_at` is preserved, so the drip calendar and daily caps are
 *     untouched. Drafts with no queued send compose fresh when you queue them.
 *
 * SAFETY
 *   - Dry run by default. Nothing is written without --apply.
 *   - Refuses to run while sending is ACTIVE, because the cron ticks every ~5
 *     minutes and could send a row mid-rewrite. Pause sending first.
 *   - Every write is guarded on status='queued', so a row the worker claimed
 *     while this was running is never clobbered.
 *   - A prospect whose redraft fails is left completely alone (old copy intact,
 *     still queued) rather than being dropped.
 *
 * RUN
 *   npm run requeue           # dry run, prints the plan and sample copy
 *   npm run requeue -- --apply
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database.types'
import { draftEmail } from '../lib/integrations/outreach/draft'
import { renderTemplate } from '../lib/integrations/outreach/template'
import { composeEmail } from '../lib/integrations/outreach/send/compose'
import { replyRiskWarnings } from '../lib/integrations/outreach/hygiene'
import type { SendSettings, SynthesisResult } from '../lib/integrations/outreach/types'
import type { LLMUsage } from '../lib/llm/client'
import { randomUUID } from 'node:crypto'

const COMPANY_ID = process.env.REQUEUE_COMPANY_ID ?? 'f8d5013c-b274-4b56-b6f7-7017e2cdecd6'
const APPLY = process.argv.includes('--apply')
const FORCE = process.argv.includes('--force')

function die(msg: string): never {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) die('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing. Run via `npm run requeue` so .env.local is loaded.')
if (!process.env.ANTHROPIC_API_KEY) die('ANTHROPIC_API_KEY missing — personalized drafts cannot be rewritten.')

// The unsubscribe URL is baked into the STORED send body, so whatever this
// process sees becomes a permanent link in a real email. Run from .env.local
// and every recipient gets a dead localhost link. Refuse rather than bake it in.
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
if (!appUrl) die('NEXT_PUBLIC_APP_URL is unset — queued sends would get no unsubscribe link.')
if (/localhost|127\.0\.0\.1|\[::1\]/i.test(appUrl)) {
  die(
    `NEXT_PUBLIC_APP_URL is "${appUrl}" — a dev URL that would be baked into real emails as a dead\n` +
      '  unsubscribe link. Re-run with the production value, e.g.\n' +
      '    NEXT_PUBLIC_APP_URL=https://signalgent.vercel.app npm run requeue -- --apply',
  )
}

const supabase = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

/** Weighted-random pick over active templates. Mirrors pickTemplateDraft in
 * enrich-run.ts, which is private to that module. */
function pickTemplate<T extends { weight: number }>(active: T[]): T {
  const total = active.reduce((s, t) => s + Math.max(1, t.weight), 0)
  let r = Math.random() * total
  for (const t of active) {
    r -= Math.max(1, t.weight)
    if (r < 0) return t
  }
  return active[active.length - 1]
}

function preview(label: string, subject: string, body: string): void {
  const risks = replyRiskWarnings(subject, body)
  console.log(`\n  ── ${label}`)
  console.log(`  subject: ${subject}`)
  console.log(body.split('\n').map((l) => `  │ ${l}`).join('\n'))
  console.log(`  reply-risk: ${risks.length ? risks.join(' · ') : 'clean'}`)
}

async function main(): Promise<void> {
  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} — company ${COMPANY_ID}\n${'='.repeat(60)}`)

  // Read outreach_settings directly rather than via worker.ts's loadSettings:
  // that module's dependency graph reaches `@/`-aliased value imports, which tsc
  // does not rewrite on emit and which would therefore fail at runtime here.
  // composeEmail only needs the sender/footer fields.
  const { data: settingsRow } = await supabase
    .from('outreach_settings')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .maybeSingle()
  if (!settingsRow) die('No outreach_settings row for this company — configure sending first.')
  const settings = settingsRow as unknown as SendSettings

  // Only gate the WRITE path: a dry run touches nothing, so there is no race to
  // protect against, and blocking it just hides the plan from you.
  if (settings.active) {
    if (APPLY && !FORCE) {
      die(
        'Sending is ACTIVE. The cron ticks every ~5 min and could send a row while this rewrites it.\n' +
          '  Turn sending off (Outreach → Sending → uncheck active), run this, then turn it back on.\n' +
          '  Use --force only if you accept the race.',
      )
    }
    console.log('⚠  Sending is ACTIVE — the drip is currently sending the OLD copy.\n')
  }

  // Scope is every UNSENT draft, not just the queued ones. Fixing only the queue
  // would leave the approved-but-unqueued and pending drafts still carrying the
  // old copy, to go out the moment they are queued.
  async function page<T>(table: string, cols: string): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(table as 'outreach_drafts')
        .select(cols)
        .eq('company_id', COMPANY_ID)
        .order('id')
        .range(from, from + 999)
      if (error) die(`Could not read ${table}: ${error.message}`)
      if (!data || data.length === 0) break
      out.push(...(data as unknown as T[]))
      if (data.length < 1000) break
    }
    return out
  }

  type DraftRow = {
    id: string; prospect_id: string; subject: string; body: string
    angle: string | null; synthesis_confidence: number | null
    facts_for_draft: unknown; step: number; status: string; template_id: string | null
  }
  type SendRow = { id: string; draft_id: string; status: string }

  const allDrafts = await page<DraftRow>('outreach_drafts', 'id, prospect_id, subject, body, angle, synthesis_confidence, facts_for_draft, step, status, template_id')
  const allSends = await page<SendRow>('outreach_sends', 'id, draft_id, status')

  // Latest meaningful send per draft: a 'sent' row wins over anything else.
  const sendByDraft = new Map<string, SendRow>()
  for (const s of allSends) {
    const cur = sendByDraft.get(s.draft_id)
    if (!cur || s.status === 'sent' || (cur.status !== 'sent' && s.status === 'queued')) sendByDraft.set(s.draft_id, s)
  }

  const targets = allDrafts.filter((d) => {
    if (d.status === 'exported' || d.status === 'rejected') return false
    const s = sendByDraft.get(d.id)
    return !s || (s.status !== 'sent' && s.status !== 'sending')
  })
  if (targets.length === 0) die('No unsent drafts. Nothing to do.')

  const prospectRows = await page<{ id: string; email: string; recipient_name: string | null; disposition: string }>(
    'outreach_prospects',
    'id, email, recipient_name, disposition',
  )
  const prospectById = new Map(prospectRows.map((p) => [p.id, p]))

  const { data: templates } = await supabase
    .from('outreach_templates')
    .select('id, name, subject, body, weight')
    .eq('company_id', COMPANY_ID)
    .eq('active', true)
  const activeTemplates = templates ?? []
  if (activeTemplates.length === 0) die('No ACTIVE templates. Run docs/outreach-template-refresh.sql first.')

  // Partition.
  const asTemplate: DraftRow[] = []
  const asPersonalized: DraftRow[] = []
  const unusable: { draft: DraftRow; why: string }[] = []
  for (const d of targets) {
    const p = prospectById.get(d.prospect_id)
    if (!p) { unusable.push({ draft: d, why: 'prospect missing' }); continue }
    if (p.disposition !== 'open') { unusable.push({ draft: d, why: `prospect ${p.disposition}` }); continue }
    const facts = (d.facts_for_draft as string[] | null) ?? []
    if (facts.length === 0) asTemplate.push(d)
    else asPersonalized.push(d)
  }
  const queuedCount = targets.filter((d) => sendByDraft.get(d.id)?.status === 'queued').length

  console.log(`unsent drafts:       ${targets.length}`)
  console.log(`  template copy:     ${asTemplate.length}  → re-render from ${activeTemplates.length} active templates (free)`)
  console.log(`  personalized:      ${asPersonalized.length}  → re-draft via Stage 3 (1 LLM call each)`)
  console.log(`  skipped:           ${unusable.length}${unusable.length ? '  (' + [...new Set(unusable.map((u) => u.why))].join(', ') + ')' : ''}`)
  console.log(`  of which QUEUED:   ${queuedCount}  → send row rewritten in place, scheduled_at preserved`)
  console.log(`  not yet queued:    ${targets.length - queuedCount}  → draft rewritten; composes fresh when you queue it`)
  console.log(`active templates:    ${activeTemplates.map((t) => t.name).join(', ')}`)

  if (!APPLY) {
    // Show one of each so the copy can be eyeballed before anything is written.
    const d = asTemplate[0]
    if (d) {
      const p = prospectById.get(d.prospect_id)!
      preview(`TEMPLATE — BEFORE (${p.email})`, d.subject, d.body)
      const chosen = pickTemplate(activeTemplates)
      const next = renderTemplate(chosen, p.recipient_name)
      preview(`TEMPLATE — AFTER  (${chosen.name})`, next.subject, next.body)
    }
    const q = asPersonalized[0]
    if (q) {
      const p = prospectById.get(q.prospect_id)!
      preview(`PERSONALIZED — BEFORE (${p.email})`, q.subject, q.body)
      console.log('\n  (AFTER requires an LLM call; run with --apply to rewrite)')
    }
    console.log(`\n${'='.repeat(60)}\nDry run — nothing written. Re-run with --apply.\n`)
    return
  }

  let rewritten = 0
  let failed = 0
  const usage: LLMUsage[] = []

  for (const d of [...asTemplate, ...asPersonalized]) {
    const p = prospectById.get(d.prospect_id)!
    const facts = (d.facts_for_draft as string[] | null) ?? []

    let subject: string
    let body: string
    const draftPatch: Database['public']['Tables']['outreach_drafts']['Update'] = {}

    if (facts.length === 0) {
      const chosen = pickTemplate(activeTemplates)
      const next = renderTemplate(chosen, p.recipient_name)
      subject = next.subject
      body = next.body
      draftPatch.template_id = chosen.id
    } else {
      const synthesis: SynthesisResult = {
        skip: false,
        skip_reason: null,
        confidence: d.synthesis_confidence ?? 1,
        angle: d.angle,
        facts_for_draft: facts,
      }
      const review = await draftEmail(synthesis, usage, d.step > 1 ? { step: d.step } : undefined)
      if (!review) {
        console.warn(`  ! redraft failed for ${p.email} — left unchanged, still queued with the old copy`)
        failed++
        continue
      }
      subject = review.draft.subject
      body = review.draft.body
      draftPatch.facts_used = review.draft.facts_used
      draftPatch.drifted_facts = review.drifted_facts
      draftPatch.clean = review.clean
    }

    const { error: draftErr } = await supabase
      .from('outreach_drafts')
      .update({ ...draftPatch, subject, body })
      .eq('id', d.id)
      .eq('company_id', COMPANY_ID)
    if (draftErr) {
      console.warn(`  ! could not update draft for ${p.email}: ${draftErr.message} — send left unchanged`)
      failed++
      continue
    }

    // A draft with no queued send just needed its copy fixed; it will compose
    // fresh (with tokens) through the normal path when you queue it.
    const queued = sendByDraft.get(d.id)
    if (queued?.status === 'queued') {
      // Compose fresh, with tracking tokens the original row predates.
      const unsub_token = randomUUID()
      const composed = composeEmail(subject, body, settings, unsub_token)

      // status='queued' guard: if the worker claimed this row mid-run, skip it
      // rather than overwrite an email that may already be going out.
      const { data: updated, error: sendErr } = await supabase
        .from('outreach_sends')
        .update({
          subject: composed.subject,
          body: composed.body,
          open_token: randomUUID(),
          unsub_token,
          updated_at: new Date().toISOString(),
        })
        .eq('id', queued.id)
        .eq('status', 'queued')
        .select('id')
      if (sendErr) {
        console.warn(`  ! draft updated but send rewrite failed for ${p.email}: ${sendErr.message}`)
        failed++
        continue
      }
      if (!updated || updated.length === 0) {
        console.warn(`  ~ ${p.email} left the queue mid-run (claimed by the worker) — draft updated, send untouched`)
        continue
      }
    }
    rewritten++
    if (rewritten % 10 === 0) console.log(`  … ${rewritten} rewritten`)
  }

  // Cost accounting, same feature tags the app uses.
  if (usage.length > 0) {
    const PRICE: Record<string, { in: number; out: number }> = {
      'claude-haiku-4-5': { in: 1, out: 5 },
      'claude-sonnet-4-6': { in: 3, out: 15 },
    }
    const rows = usage.map((u) => {
      const pr = PRICE[u.model] ?? { in: 0, out: 0 }
      const cost = (u.inputTokens / 1e6) * pr.in + (u.outputTokens / 1e6) * pr.out
      return {
        company_id: COMPANY_ID,
        user_id: null,
        service: 'anthropic' as const,
        model: u.model,
        input_tokens: u.inputTokens,
        output_tokens: u.outputTokens,
        cost_usd: Math.round(cost * 1e6) / 1e6,
        feature: `outreach:${u.task}`,
      }
    })
    await supabase.from('api_usage').insert(rows)
    const total = rows.reduce((s, r) => s + r.cost_usd, 0)
    console.log(`\nLLM: ${usage.length} calls, $${total.toFixed(4)}`)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`rewritten: ${rewritten}   failed/skipped: ${failed}`)
  console.log('Turn sending back on when you are ready.\n')
}

main().catch((err) => die(err instanceof Error ? err.stack ?? err.message : String(err)))
