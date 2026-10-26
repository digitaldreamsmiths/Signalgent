/**
 * One-off prod repair: lay a company's queued sends back out on the calendar.
 *
 * WHY THIS IS NEEDED
 * The worker sends whatever is due (scheduled_at <= now), ten rows per
 * five-minute tick, and trusts the slots to have enforced the daily cap when
 * they were assigned. Pause sending for a while and that trust breaks: every
 * slot that passed during the pause is due at once, so resuming drains the
 * backlog at ~120 an hour. SourceGent paused on 2026-10-15 with 1,233 openers
 * queued through late November; 305 were past due eleven days later, which is a
 * week of the mailbox's quota in one afternoon, right after Microsoft had
 * restricted it for outbound spam.
 *
 * WHAT IT DOES
 * Takes every QUEUED send for the company, in its existing scheduled order, and
 * reassigns scheduled_at from --start using the worker's own computeBatchSlots:
 * min_gap apart, selected weekdays only, up to the warmup ramp and daily cap,
 * rolling to the next day's window start. Bodies and tokens are untouched.
 *
 * Optionally restarts the warmup with new numbers, because a mailbox coming
 * off a restriction should ramp slower than it did the first time:
 *   --warmup-start N  --warmup-increment N  --daily-limit N
 * With any of these, warmup_started_at is anchored to --start so the ramp
 * begins there, and the new values are written to outreach_settings on --apply.
 * The dry run already lays out the calendar with the new numbers, so you see
 * exactly how long the queue takes before committing.
 *
 * --skip 2026-11-26,2026-12-25 blocks out dates (company timezone) the app's
 * weekday-only send_days cannot express, such as holidays. Implemented by
 * reserving that day's full cap, which is how computeBatchSlots rolls past it.
 *
 * SAFETY
 *   - Dry run by default: prints the per-day plan, writes nothing.
 *   - Refuses to run while sending is ACTIVE (the worker could claim a row mid
 *     rewrite). Pause first, re-slot, then resume.
 *   - Every write is guarded on status = 'queued'.
 *   - Does not flip sending on. Do that in the app once the mailbox is clear.
 *
 * RUN
 *     npm run reslot -- --company <uuid>                          # dry run from next send day
 *     npm run reslot -- --company <uuid> --start 2026-10-27 \
 *         --warmup-start 10 --warmup-increment 3 --daily-limit 25   # dry run, slower ramp
 *     ... --skip 2026-11-26,2026-11-27,2026-12-24,2026-12-25,2027-01-01  # holidays
 *     ... --apply                                                 # commit
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/types/database.types'
import type { SendSettings } from '../lib/integrations/outreach/types'
import { computeBatchSlots, isSendableDay, loadSettings, zonedStartIso } from '../lib/integrations/outreach/send/worker'

const APPLY = process.argv.includes('--apply')
const CONCURRENCY = 10

function arg(flag: string): string | undefined {
  const at = process.argv.indexOf(flag)
  return at >= 0 ? process.argv[at + 1] : undefined
}
function num(flag: string): number | undefined {
  const v = arg(flag)
  if (v === undefined) return undefined
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive integer`)
  return n
}

/** Calendar date ("2026-10-27") and weekday of an instant in a timezone. */
function wallDate(d: Date, tz: string): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday }
}

/** The first selected send day on or after today, as "YYYY-MM-DD" in the company timezone. */
function nextSendDate(settings: SendSettings): string {
  const cursor = new Date()
  for (let i = 0; i < 14; i++) {
    const w = wallDate(cursor, settings.timezone)
    if (isSendableDay(w, settings.send_days)) return w.date
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  throw new Error('No selected send day in the next two weeks; check send_days.')
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const companyId = arg('--company')?.trim()
  if (!companyId) throw new Error('Pass --company <uuid>.')
  const svc = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const stored = await loadSettings(svc, companyId)
  if (stored.active) throw new Error('Sending is ACTIVE for this company. Pause it in the app first, re-slot, then resume.')

  const warmupStart = num('--warmup-start')
  const warmupIncrement = num('--warmup-increment')
  const dailyLimit = num('--daily-limit')
  const restartWarmup = warmupStart !== undefined || warmupIncrement !== undefined || dailyLimit !== undefined

  const startDate = arg('--start')?.trim() || nextSendDate(stored)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('--start must be YYYY-MM-DD (company timezone).')
  const startIso = zonedStartIso(startDate, stored.send_window_start, stored.timezone)
  if (!startIso) throw new Error(`Could not resolve ${startDate} ${stored.send_window_start} in ${stored.timezone}.`)

  // The calendar is laid out with the settings as they WILL be, so the dry run
  // shows the real plan. Anchoring warmup at the start date means day one of
  // the restart sends warmup_start_per_day, not the tail of the old ramp.
  const settings: SendSettings = {
    ...stored,
    ...(restartWarmup
      ? {
          warmup_enabled: true,
          warmup_started_at: startIso,
          warmup_start_per_day: warmupStart ?? stored.warmup_start_per_day,
          warmup_increment_per_day: warmupIncrement ?? stored.warmup_increment_per_day,
          daily_send_limit: dailyLimit ?? stored.daily_send_limit,
        }
      : {}),
  }

  const queued: { id: string; scheduled_at: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc
      .from('outreach_sends')
      .select('id, scheduled_at')
      .eq('company_id', companyId)
      .eq('status', 'queued')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('id')
      .range(from, from + 999)
    if (error) throw error
    queued.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${queued.length} queued send(s) for ${companyId}`)
  if (queued.length === 0) return
  const pastDue = queued.filter((q) => q.scheduled_at && q.scheduled_at <= new Date().toISOString()).length
  console.log(`currently past due: ${pastDue}`)
  console.log(`start: ${startDate} ${settings.send_window_start} ${settings.timezone} (${startIso})`)
  console.log(
    `cap: ${settings.warmup_enabled ? `warmup ${settings.warmup_start_per_day} +${settings.warmup_increment_per_day}/day up to ${settings.daily_send_limit}` : `${settings.daily_send_limit}/day`}` +
      `, gap ${settings.min_gap_minutes} min, days ${settings.send_days.join(',')}${restartWarmup ? ' (warmup restarted at start date)' : ''}`,
  )

  const skipDates = (arg('--skip') ?? '').split(',').map((d) => d.trim()).filter(Boolean)
  const reserved: string[] = []
  for (const d of skipDates) {
    const iso = zonedStartIso(d, settings.send_window_start, settings.timezone)
    if (!iso) throw new Error(`--skip date ${d} must be YYYY-MM-DD.`)
    // Fill the day to its cap so the layout rolls straight past it.
    for (let i = 0; i < settings.daily_send_limit; i++) reserved.push(iso)
  }
  if (skipDates.length) console.log(`skipping: ${skipDates.join(', ')}`)

  // Excluding every queued id means the layout counts only sent rows against
  // each day, i.e. the queue is placed as if it had never been slotted.
  const slots = await computeBatchSlots(svc, companyId, settings, startIso, queued.length, queued.map((q) => q.id), reserved, settings.timezone)
  if (slots.length !== queued.length) throw new Error(`Expected ${queued.length} slots, got ${slots.length}.`)

  const perDay = new Map<string, number>()
  for (const s of slots) {
    const d = wallDate(new Date(s), settings.timezone).date
    perDay.set(d, (perDay.get(d) ?? 0) + 1)
  }
  console.log('\nplan:')
  for (const [d, n] of perDay) console.log(`  ${d}  ${n}`)
  console.log(`last send: ${wallDate(new Date(slots[slots.length - 1]), settings.timezone).date} (${perDay.size} send days)`)

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write the slots' + (restartWarmup ? ' and the warmup settings' : '') + '.')
    return
  }

  if (restartWarmup) {
    const { error } = await svc
      .from('outreach_settings')
      .update({
        warmup_enabled: true,
        warmup_started_at: startIso,
        warmup_start_per_day: settings.warmup_start_per_day,
        warmup_increment_per_day: settings.warmup_increment_per_day,
        daily_send_limit: settings.daily_send_limit,
      })
      .eq('company_id', companyId)
    if (error) throw error
    console.log('\nwarmup settings written')
  }

  let updated = 0
  let skipped = 0
  for (let i = 0; i < queued.length; i += CONCURRENCY) {
    const batch = queued.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map((q, j) =>
        svc.from('outreach_sends').update({ scheduled_at: slots[i + j] }).eq('id', q.id).eq('company_id', companyId).eq('status', 'queued').select('id'),
      ),
    )
    for (const r of results) {
      if (r.error) throw r.error
      if (r.data && r.data.length > 0) updated++
      else skipped++
    }
  }
  console.log(`re-slotted ${updated}, skipped ${skipped} (no longer queued)`)
}

main().catch((err) => { console.error(err); process.exit(1) })
