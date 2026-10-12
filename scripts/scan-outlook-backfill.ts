/**
 * One-off: read a company's Microsoft 365 mailbox and record every bounce,
 * reply and opt-out that landed since sending started.
 *
 * WHY THIS IS NEEDED
 * Reply/bounce scanning only existed for Gmail. A company sending through
 * Outlook accumulated bounces and "stop" replies in its inbox that the app never
 * saw: prospects stayed `open`, bounces never counted toward the auto-pause
 * rate, and opt-outs were not suppressed. This runs the new Outlook scanner
 * once over the full lookback window (30 days, or since warmup started).
 *
 * PREREQUISITE
 * The mailbox must be reconnected after Mail.Read was added to the Outlook
 * scopes; the scanner reports "reconnect ..." otherwise and writes nothing.
 *
 * SAFETY
 *   - Dry run by default: lists what WOULD change, writes nothing.
 *   - --apply records bounces/replies, moves prospects off `open`, and cancels
 *     queued mail to suppressed addresses (the same path the cron uses).
 *
 * RUN
 *     npm run scan-outlook -- --company <uuid>            # dry run
 *     npm run scan-outlook -- --company <uuid> --apply
 *
 * THREAD IDS
 *   --threads instead matches id-less sent rows to their Sent Items copies and
 *   stores thread_id / message_id_header, so follow-ups to sends made before
 *   the Outlook path captured ids can still thread. Same dry-run/--apply rule.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database.types'
import { scanReplies } from '../lib/integrations/outreach/send/scan'
import { backfillOutlookThreads } from '../lib/integrations/outreach/send/outlook-threads'

const APPLY = process.argv.includes('--apply')
const THREADS = process.argv.includes('--threads')

function companyId(): string {
  const flagAt = process.argv.indexOf('--company')
  const raw = (flagAt >= 0 ? process.argv[flagAt + 1] : process.env.SCAN_COMPANY_ID)?.trim()
  if (!raw) throw new Error('Pass --company <uuid> (or SCAN_COMPANY_ID).')
  return raw
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const svc = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const id = companyId()
  if (THREADS) {
    const { details, ...summary } = await backfillOutlookThreads(svc, id, { dryRun: !APPLY })
    console.log(APPLY ? 'APPLIED' : 'DRY RUN', JSON.stringify(summary))
    for (const d of details.filter((x) => !x.matched)) console.log(`unmatched    ${d.sentAt.slice(0, 16)}  ${d.email.padEnd(40)}  ${d.subject.slice(0, 60)}`)
    if (!APPLY && summary.matched) console.log('\nRe-run with --threads --apply to store these.')
    return
  }
  const result = await scanReplies(svc, id, { force: true, dryRun: !APPLY })
  const { details = [], ...summary } = result
  console.log(APPLY ? 'APPLIED' : 'DRY RUN', JSON.stringify(summary))
  for (const d of details.sort((a, b) => a.kind.localeCompare(b.kind) || a.at.localeCompare(b.at))) {
    console.log(`${d.kind.padEnd(12)} ${d.at.slice(0, 16)}  ${d.email.padEnd(40)}  ${d.subject.slice(0, 60)}`)
  }
  if (!APPLY && details.length) console.log('\nRe-run with --apply to record these.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
