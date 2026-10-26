/**
 * One-off prod repair: put follow-ups the send worker canceled back in the queue.
 *
 * WHY THIS IS NEEDED
 * Until 2026-10-26 the worker canceled EVERY Microsoft 365 follow-up at send
 * time ("Microsoft 365 follow-ups require reply detection"), a guard written
 * before the Outlook reply scanner existed. The sweep never regenerates a touch
 * whose draft already exists, so those sequences were dead: 196 PlateTell
 * follow-ups to churches that had opened the opener.
 *
 * WHAT IT DOES
 * For each canceled send carrying that error whose prospect is still open, it
 * calls the same autoQueueDraftSend the sweep uses: a fresh composed body and
 * tokens, the next free slot under the daily cap, and the usual suppression and
 * disposition checks. Nothing is edited in place.
 *
 * SAFETY
 *   - Dry run by default: lists what would be queued, writes nothing.
 *   - Skips prospects that replied, bounced, or unsubscribed since.
 *   - Skips a draft that already has a queued, sending, or sent row.
 *   - Skips sequences whose opener is older than --max-age-days (default 45,
 *     the sweep's own ceiling), so a months-old thread is not resurrected.
 *
 * RUN
 *     npm run requeue-followups -- --company <uuid>            # dry run
 *     npm run requeue-followups -- --company <uuid> --apply
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database.types'
import { autoQueueDraftSend } from '../lib/integrations/outreach/send/queue'

const APPLY = process.argv.includes('--apply')
const CANCEL_ERROR = 'Microsoft 365 follow-ups require reply detection'

function arg(flag: string): string | undefined {
  const at = process.argv.indexOf(flag)
  return at >= 0 ? process.argv[at + 1] : undefined
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const companyId = arg('--company')?.trim()
  if (!companyId) throw new Error('Pass --company <uuid>.')
  const maxAgeDays = Number(arg('--max-age-days') ?? 45)
  const svc = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: canceled, error } = await svc
    .from('outreach_sends')
    .select('id, draft_id, prospect_id, recipient_email, subject')
    .eq('company_id', companyId)
    .eq('status', 'canceled')
    .eq('error', CANCEL_ERROR)
    .order('created_at')
  if (error) throw error
  const rows = canceled ?? []
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${rows.length} canceled follow-up send(s)`)
  if (rows.length === 0) return

  const draftIds = [...new Set(rows.map((r) => r.draft_id))]
  const prospectIds = [...new Set(rows.map((r) => r.prospect_id))]
  const [{ data: prospects }, { data: live }, { data: openers }] = await Promise.all([
    svc.from('outreach_prospects').select('id, disposition').eq('company_id', companyId).in('id', prospectIds),
    svc.from('outreach_sends').select('draft_id').eq('company_id', companyId).in('draft_id', draftIds).in('status', ['queued', 'sending', 'sent']),
    svc.from('outreach_sends').select('prospect_id, sent_at').eq('company_id', companyId).eq('status', 'sent').in('prospect_id', prospectIds),
  ])
  const disposition = new Map((prospects ?? []).map((p) => [p.id, p.disposition]))
  const alreadyLive = new Set((live ?? []).map((s) => s.draft_id))
  const lastSent = new Map<string, number>()
  for (const s of openers ?? []) {
    const t = s.sent_at ? Date.parse(s.sent_at) : 0
    if (t > (lastSent.get(s.prospect_id) ?? 0)) lastSent.set(s.prospect_id, t)
  }

  const skipped: Record<string, number> = {}
  const todo: typeof rows = []
  const seenDraft = new Set<string>()
  for (const r of rows) {
    const reason =
      disposition.get(r.prospect_id) !== 'open' ? `prospect ${disposition.get(r.prospect_id) ?? 'missing'}`
      : alreadyLive.has(r.draft_id) ? 'draft already queued or sent'
      : seenDraft.has(r.draft_id) ? 'duplicate canceled row'
      : (Date.now() - (lastSent.get(r.prospect_id) ?? 0)) / 86_400_000 > maxAgeDays ? `opener older than ${maxAgeDays} days`
      : null
    if (reason) { skipped[reason] = (skipped[reason] ?? 0) + 1; continue }
    seenDraft.add(r.draft_id)
    todo.push(r)
  }
  console.log(`eligible: ${todo.length}`, Object.keys(skipped).length ? `| skipped ${JSON.stringify(skipped)}` : '')
  for (const r of todo.slice(0, 10)) console.log('  ', r.recipient_email, '|', r.subject)
  if (todo.length > 10) console.log(`   ... and ${todo.length - 10} more`)
  if (!APPLY) { console.log('\nDry run. Re-run with --apply to queue them.'); return }

  let queued = 0
  let refused = 0
  for (const r of todo) {
    const ok = await autoQueueDraftSend(svc, companyId, r.draft_id)
    if (ok) queued++
    else { refused++; console.warn('   not queued:', r.recipient_email) }
  }
  console.log(`\nqueued ${queued}, refused ${refused}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
