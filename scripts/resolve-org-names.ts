/**
 * One-off: fill outreach_prospects.recipient_name for a company's open,
 * still-unnamed prospects (see lib/integrations/outreach/org-name.ts).
 *
 * WHY THIS IS NEEDED
 * With USASpending enrichment disabled, no prospect is ever named, so every
 * template greeting renders "Hi," and `{company}` drops out of the body. This
 * reads the organization's website (or, for free-mail addresses, the address
 * itself) and stores a name the templates can use.
 *
 * SAFETY
 *   - Dry run by default: prints what would be stored, writes nothing.
 *   - Never overwrites a non-null recipient_name (manual edits win).
 *   - Only touches prospects at the `open` disposition.
 *
 * RUN
 *     npm run resolve-names -- --company <uuid>            # dry run
 *     npm run resolve-names -- --company <uuid> --apply
 *     npm run resolve-names -- --company <uuid> --limit 20  # sample
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database.types'
import { resolveOrgName, type OrgName } from '../lib/integrations/outreach/org-name'

const APPLY = process.argv.includes('--apply')
const CONCURRENCY = 6

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
  const limit = Number(arg('--limit') ?? 0) || undefined
  const svc = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  let q = svc
    .from('outreach_prospects')
    .select('id, email')
    .eq('company_id', companyId)
    .eq('disposition', 'open')
    .is('recipient_name', null)
    .order('email')
  if (limit) q = q.limit(limit)
  const { data: prospects, error } = await q
  if (error) throw error
  const rows = prospects ?? []
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${rows.length} unnamed open prospects`)

  const results: { id: string; email: string; name: OrgName | null }[] = []
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const slice = rows.slice(i, i + CONCURRENCY)
    const batch = await Promise.all(slice.map(async (p) => ({ id: p.id, email: p.email, name: await resolveOrgName(p.email).catch(() => null) })))
    results.push(...batch)
    for (const r of batch) {
      console.log(`${(r.name?.source ?? '-').padEnd(8)} ${r.email.padEnd(44)} ${r.name?.name ?? ''}`)
    }
  }

  const named = results.filter((r) => r.name)
  const bySource = { site: named.filter((r) => r.name!.source === 'site').length, address: named.filter((r) => r.name!.source === 'address').length }
  console.log(`\nresolved ${named.length}/${results.length} (site ${bySource.site}, address ${bySource.address})`)

  if (!APPLY) {
    if (named.length) console.log('Re-run with --apply to store these.')
    return
  }
  let written = 0
  for (const r of named) {
    const { error: updateError } = await svc
      .from('outreach_prospects')
      .update({
        recipient_name: r.name!.name,
        resolution_method: r.name!.source === 'site' ? 'heuristic' : 'ai_judge',
        resolution_confidence: r.name!.source === 'site' ? 0.7 : 0.5,
        updated_at: new Date().toISOString(),
      })
      .eq('id', r.id)
      .is('recipient_name', null)
    if (updateError) console.error(`write failed for ${r.email}: ${updateError.message}`)
    else written++
  }
  console.log(`stored ${written} names`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
