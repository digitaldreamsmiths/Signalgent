/**
 * Send-queue worker core. Plain module (NOT 'use server') so it can be called
 * both by the user-scoped server actions and by the unauthenticated cron route
 * (service-role client). All functions take a Supabase client so the caller
 * controls auth.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import type { SendSettings } from '../types'
import { getProvider, type ProviderName } from './provider'
import { listUnsubscribeHeaders, openPixelUrl, textToHtml, unsubscribeUrl } from './tracking'
import { fetchAllPages } from '../fetch-all'

type DB = SupabaseClient<Database>

/** Per-tick cap on how many due emails the worker sends. */
const BATCH = 10

/** A row still 'sending' after this many minutes was stranded by a crash/timeout
 * of a previous tick (a single send takes seconds, and ticks run every ~5 min). */
const STALE_SENDING_MINUTES = 10

export const SETTINGS_DEFAULTS: SendSettings = {
  sender_name: null,
  sender_email: null,
  reply_to: null,
  daily_send_limit: 25,
  send_window_start: '09:00',
  send_window_end: '17:00',
  timezone: 'America/New_York',
  min_gap_minutes: 6,
  signature: null,
  physical_address: null,
  unsubscribe_line: null,
  provider: 'dry_run',
  active: false,
  pause_reason: null,
  warmup_enabled: true,
  warmup_start_per_day: 10,
  warmup_increment_per_day: 5,
  warmup_started_at: null,
  bounce_pause_enabled: true,
  bounce_pause_threshold: 0.05,
  bounce_pause_window_days: 7,
  bounce_pause_min_sends: 20,
}

export async function loadSettings(supabase: DB, companyId: string): Promise<SendSettings> {
  const { data } = await supabase.from('outreach_settings').select('*').eq('company_id', companyId).maybeSingle()
  if (!data) return { ...SETTINGS_DEFAULTS }
  return {
    sender_name: data.sender_name,
    sender_email: data.sender_email,
    reply_to: data.reply_to,
    daily_send_limit: data.daily_send_limit,
    send_window_start: data.send_window_start,
    send_window_end: data.send_window_end,
    timezone: data.timezone,
    min_gap_minutes: data.min_gap_minutes,
    signature: data.signature,
    physical_address: data.physical_address,
    unsubscribe_line: data.unsubscribe_line,
    provider: data.provider,
    active: data.active,
    pause_reason: data.pause_reason,
    warmup_enabled: data.warmup_enabled,
    warmup_start_per_day: data.warmup_start_per_day,
    warmup_increment_per_day: data.warmup_increment_per_day,
    warmup_started_at: data.warmup_started_at,
    bounce_pause_enabled: data.bounce_pause_enabled,
    bounce_pause_threshold: data.bounce_pause_threshold,
    bounce_pause_window_days: data.bounce_pause_window_days,
    bounce_pause_min_sends: data.bounce_pause_min_sends,
  }
}

// ── Timezone helpers (no date lib; DST edge cases acceptable for scheduling) ──

interface Wall { y: number; mo: number; d: number; h: number; mi: number; weekday: number }

/** Parse a wall-clock time — "17:00", "9:00", "8:00 pm", "8pm" — to [hour,
 * minute]. Returns null when unparseable, so callers can fall back rather than
 * silently misread "8:00 pm" as 8 AM. */
export function parseWallTime(raw: string): [number, number] | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$|^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  let h = parseInt(m[1] ?? m[4], 10)
  const mi = parseInt(m[2] ?? m[5] ?? '0', 10)
  const meridiem = m[3]
  if (meridiem) {
    if (h < 1 || h > 12) return null
    if (meridiem === 'p' && h < 12) h += 12
    if (meridiem === 'a' && h === 12) h = 0
  }
  if (h > 23 || mi > 59) return null
  return [h, mi]
}

/** Calendar Y/M/D + H:M (+ weekday 0=Sun) of an instant as seen in `tz`. */
function wallParts(date: Date, tz: string): Wall {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {})
  const y = +parts.year, mo = +parts.month, d = +parts.day
  const h = +parts.hour % 24, mi = +parts.minute
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  return { y, mo, d, h, mi, weekday }
}

/** The UTC instant for a wall-clock time (y/mo/d h:m) in `tz`. */
function fromZonedWall(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  // How far ahead of UTC is tz at that instant?
  const seen = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(guess)).reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {})
  const seenUTC = Date.UTC(+seen.year, +seen.month - 1, +seen.day, +seen.hour % 24, +seen.minute, +seen.second)
  const offset = seenUTC - guess
  return new Date(guess - offset)
}

function nextDayWindowStart(w: Wall, tz: string, wsH: number, wsM: number): Date {
  const d = new Date(Date.UTC(w.y, w.mo - 1, w.d))
  d.setUTCDate(d.getUTCDate() + 1)
  return fromZonedWall(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), wsH, wsM, tz)
}

// ── Warmup ramp ───────────────────────────────────────────────────────────────

/** Whole-day number for a wall date (time ignored). */
function wallDayNum(w: { y: number; mo: number; d: number }): number {
  return Math.floor(Date.UTC(w.y, w.mo - 1, w.d) / 86400000)
}

/** Count Mon–Fri days in [aNum, bNum] inclusive, given the weekday of aNum (0=Sun). */
function countWeekdaysInclusive(aNum: number, bNum: number, aWeekday: number): number {
  if (bNum < aNum) return 0
  const total = bNum - aNum + 1
  const fullWeeks = Math.floor(total / 7)
  let weekdays = fullWeeks * 5
  const rem = total - fullWeeks * 7
  for (let i = 0; i < rem; i++) {
    const wd = (aWeekday + i) % 7
    if (wd !== 0 && wd !== 6) weekdays++
  }
  return weekdays
}

/** Build the per-day effective send cap. With warmup on, the cap ramps from
 * warmup_start_per_day, +warmup_increment_per_day each sending weekday since the
 * anchor (warmup_started_at, defaulting to now), up to daily_send_limit. */
function makeCapForDay(settings: SendSettings, tz: string): (w: Wall) => number {
  const limit = settings.daily_send_limit
  if (!settings.warmup_enabled) return () => limit
  const anchor = wallParts(settings.warmup_started_at ? new Date(settings.warmup_started_at) : new Date(), tz)
  const anchorNum = wallDayNum(anchor)
  return (w: Wall) => {
    const idx = Math.max(0, countWeekdaysInclusive(anchorNum, wallDayNum(w), anchor.weekday) - 1)
    return Math.min(limit, settings.warmup_start_per_day + idx * settings.warmup_increment_per_day)
  }
}

/** The effective daily cap for "today" — used for buffer sizing and the UI. */
export function getEffectiveDailyCap(settings: SendSettings, now: Date = new Date()): number {
  return makeCapForDay(settings, settings.timezone)(wallParts(now, settings.timezone))
}

/**
 * The next available send slot: after the last planned send + min gap, clamped
 * into the Mon–Fri business-hours window, rolling to the next day once the daily
 * cap is hit. Returns an ISO string.
 */
export async function nextSlot(supabase: DB, companyId: string, settings: SendSettings): Promise<string> {
  const tz = settings.timezone
  let [wsH, wsM] = parseWallTime(settings.send_window_start) ?? [9, 0]
  let [weH, weM] = parseWallTime(settings.send_window_end) ?? [17, 0]
  if (weH * 60 + weM <= wsH * 60 + wsM) {
    // An inverted or empty window admits no slot on any day, so the search
    // below would run off its guard and schedule ~500 days out. Fall back to
    // the default window instead.
    ;[wsH, wsM] = [9, 0]
    ;[weH, weM] = [17, 0]
  }
  const now = new Date()

  // Only sends scheduled today-or-later (48h margin for timezone skew) can
  // affect slot search, and the filter keeps this under the silent 1,000-row
  // cap; paged anyway so a big queued backlog can't overflow it and
  // under-count a day (which would overshoot the daily cap).
  const horizon = new Date(now.getTime() - 48 * 3600_000).toISOString()
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('outreach_sends')
      .select('scheduled_at')
      .eq('company_id', companyId)
      .in('status', ['queued', 'sending', 'sent'])
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', horizon)
      .order('scheduled_at')
      .order('id')
      .range(from, to),
  )
  const planned = rows.map((r) => new Date(r.scheduled_at as string))
  const counts = new Map<string, number>()
  const dayLatest = new Map<string, number>() // ms of the last send already on each day
  for (const d of planned) {
    const w = wallParts(d, tz)
    const key = `${w.y}-${w.mo}-${w.d}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    dayLatest.set(key, Math.max(dayLatest.get(key) ?? 0, d.getTime()))
  }

  // Fill the EARLIEST open slot from now — NOT after the whole queue. Roll forward
  // over weekends, past-window times, and days already at their (warmup) cap; on a
  // usable day, sit min_gap past whatever is already scheduled that day so a fresh
  // "Queue to send" lands as soon as there's capacity instead of behind the batch.
  const capForDay = makeCapForDay(settings, tz)
  let slot = new Date(now.getTime())
  for (let i = 0; i < 500; i++) {
    const w = wallParts(slot, tz)
    if (w.weekday === 0 || w.weekday === 6) { slot = nextDayWindowStart(w, tz, wsH, wsM); continue }
    const key = `${w.y}-${w.mo}-${w.d}`
    const winStart = fromZonedWall(w.y, w.mo, w.d, wsH, wsM, tz)
    const winEnd = fromZonedWall(w.y, w.mo, w.d, weH, weM, tz)
    const lastThatDay = dayLatest.get(key) ?? 0
    const earliest = Math.max(slot.getTime(), winStart.getTime(), lastThatDay ? lastThatDay + settings.min_gap_minutes * 60000 : 0)
    slot = new Date(earliest)
    if (slot.getTime() >= winEnd.getTime()) { slot = nextDayWindowStart(w, tz, wsH, wsM); continue }
    if ((counts.get(key) ?? 0) >= capForDay(w)) { slot = nextDayWindowStart(w, tz, wsH, wsM); continue }
    return slot.toISOString()
  }
  return slot.toISOString()
}

/**
 * Lay out `count` send slots starting at an explicit `startAt` (honoring the
 * user's chosen time — NOT clamped to business hours). Each slot is the previous
 * + min_gap; once a calendar day hits `daily_send_limit` (counting existing
 * queued/sent sends), the rest roll to the next day at the same wall-clock
 * start time. Returns ISO strings.
 */
export async function computeBatchSlots(
  supabase: DB,
  companyId: string,
  settings: SendSettings,
  startAtIso: string,
  count: number,
  excludeSendIds: string[] = [],
): Promise<string[]> {
  const tz = settings.timezone
  const now = new Date()
  // Never schedule in the past.
  let cur = new Date(Math.max(new Date(startAtIso).getTime(), now.getTime()))
  const startWall = wallParts(cur, tz)
  const startH = startWall.h
  const startM = startWall.mi

  const exclude = new Set(excludeSendIds)
  // Same bound + paging as nextSlot: `cur` never starts before now, so older
  // rows can't affect day counts, and paging keeps a large queued backlog from
  // being truncated at 1,000 rows (which would over-fill days already at cap).
  const horizon = new Date(now.getTime() - 48 * 3600_000).toISOString()
  const rows = await fetchAllPages((from, to) =>
    supabase
      .from('outreach_sends')
      .select('id, scheduled_at')
      .eq('company_id', companyId)
      .in('status', ['queued', 'sending', 'sent'])
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', horizon)
      .order('scheduled_at')
      .order('id')
      .range(from, to),
  )
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (exclude.has(r.id)) continue // rows being rescheduled shouldn't count against themselves
    const w = wallParts(new Date(r.scheduled_at as string), tz)
    const key = `${w.y}-${w.mo}-${w.d}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const capForDay = makeCapForDay(settings, tz)
  const slots: string[] = []
  for (let i = 0; i < count; i++) {
    // Roll forward over any day that's already at capacity.
    for (let guard = 0; guard < 800; guard++) {
      const w = wallParts(cur, tz)
      if ((counts.get(`${w.y}-${w.mo}-${w.d}`) ?? 0) < capForDay(w)) break
      cur = nextDayWindowStart(w, tz, startH, startM)
    }
    const w = wallParts(cur, tz)
    const key = `${w.y}-${w.mo}-${w.d}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    slots.push(cur.toISOString())
    cur = new Date(cur.getTime() + settings.min_gap_minutes * 60000)
  }
  return slots
}

/** Retry a flaky Supabase write a few times. Used where a dropped write would
 * corrupt the send lifecycle (e.g. an unrecorded 'sent' → duplicate email). */
async function updateWithRetry(
  attempt: () => PromiseLike<{ error: { message: string } | null }>,
  tries = 3,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let message = 'unknown error'
  for (let i = 0; i < tries; i++) {
    const { error } = await attempt()
    if (!error) return { ok: true }
    message = error.message
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)))
  }
  return { ok: false, message }
}

/**
 * Recover rows stranded in 'sending' by a crash/timeout of a previous tick.
 * The email may or may not have left the provider before the crash, so a blind
 * re-queue risks a duplicate send to a real prospect — mark them failed with a
 * note telling the user to verify instead. Keys on `updated_at`, which the
 * worker sets explicitly when it claims a row (outreach_sends has no touch
 * trigger; rows stranded before that write default to created_at, which is
 * also stale by then).
 */
export async function recoverStaleSending(supabase: DB, companyId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SENDING_MINUTES * 60000).toISOString()
  const { data, error } = await supabase
    .from('outreach_sends')
    .update({
      status: 'failed',
      error: 'interrupted mid-send, verify in Gmail Sent folder before re-queuing',
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('status', 'sending')
    .lt('updated_at', cutoff)
    .select('id')
  if (error) {
    console.error(`[send-worker] stale-sending recovery failed for company ${companyId}: ${error.message}`)
    return 0
  }
  return data?.length ?? 0
}

/**
 * Send the due, queued emails for a company (one tick). `scheduled_at` is the
 * source of truth for timing (set by auto-slotting or explicit user scheduling),
 * so the worker simply sends whatever is due — no business-hours gate here.
 * Recovers rows a crashed tick left in 'sending', re-checks suppression, marks
 * sending → sent/failed, advances the sent draft to 'exported'. No-ops when
 * sending is inactive.
 */
export async function runQueue(supabase: DB, companyId: string): Promise<{ sent: number; failed: number; recovered: number }> {
  // Sweep stale 'sending' rows even when paused, so nothing hangs invisibly.
  const recovered = await recoverStaleSending(supabase, companyId)

  const settings = await loadSettings(supabase, companyId)
  if (!settings.active) return { sent: 0, failed: 0, recovered }

  let provider
  try {
    provider = getProvider(settings.provider as ProviderName, { companyId, supabase })
  } catch {
    return { sent: 0, failed: 0, recovered } // misconfigured provider — nothing to do this tick
  }

  // Tracking columns are selected separately from the fields the send actually
  // needs. Until the open-tracking migration is applied, selecting them errors
  // and would return zero rows, silently halting ALL sending — so fall back to
  // the pre-tracking column set rather than letting a pending migration stop
  // the drip. Same defensive shape as savePreview in scan.ts.
  const dueQuery = (cols: string) =>
    supabase
      .from('outreach_sends')
      .select(cols)
      .eq('company_id', companyId)
      .eq('status', 'queued')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(BATCH)

  const BASE_COLS = 'id, draft_id, prospect_id, recipient_email, subject, body'
  type DueRow = {
    id: string; draft_id: string; prospect_id: string; recipient_email: string
    subject: string; body: string; open_token?: string | null; unsub_token?: string | null
  }
  let due: DueRow[] | null = null
  const withTokens = await dueQuery(`${BASE_COLS}, open_token, unsub_token`)
  if (withTokens.error) {
    console.warn(`[send-worker] tracking columns unavailable (${withTokens.error.message}); sending without tracking`)
    const plain = await dueQuery(BASE_COLS)
    due = (plain.data ?? null) as DueRow[] | null
  } else {
    due = (withTokens.data ?? null) as unknown as DueRow[] | null
  }

  let sent = 0
  let failed = 0
  for (const s of due ?? []) {
    // Suppression re-check at send time.
    const { data: p } = await supabase.from('outreach_prospects').select('disposition').eq('id', s.prospect_id).maybeSingle()
    if (p && p.disposition !== 'open') {
      const { error: cancelErr } = await supabase.from('outreach_sends').update({ status: 'canceled', error: 'prospect closed before send' }).eq('id', s.id)
      // On failure the row stays 'queued' and is re-checked (and re-canceled) next tick.
      if (cancelErr) console.error(`[send-worker] could not cancel send ${s.id}: ${cancelErr.message}`)
      continue
    }
    // Claim the row before talking to the provider. If the claim can't be
    // recorded, skip — sending with unrecorded state risks a duplicate later.
    // updated_at is set explicitly (no touch trigger) so the stale sweep can
    // tell how long the row has been in 'sending'.
    const { error: claimErr } = await supabase
      .from('outreach_sends')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', s.id)
    if (claimErr) {
      console.error(`[send-worker] could not claim send ${s.id}: ${claimErr.message}`)
      continue
    }
    // Thread follow-ups under the prospect's most recent sent email.
    const { data: prior } = await supabase
      .from('outreach_sends')
      .select('thread_id, message_id_header')
      .eq('company_id', companyId)
      .eq('prospect_id', s.prospect_id)
      .eq('status', 'sent')
      .not('thread_id', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    // Tracking is derived at send time, never persisted: outreach_sends.body
    // stays the plaintext the user reviewed. Rows queued before tracking
    // existed have null tokens and simply send as plaintext, unchanged.
    const pixel = s.open_token ? openPixelUrl(s.open_token) : null
    const unsub = s.unsub_token ? unsubscribeUrl(s.unsub_token) : null
    const listUnsub = listUnsubscribeHeaders({
      url: unsub,
      mailto: settings.reply_to?.trim() || settings.sender_email?.trim() || null,
    })

    let res
    try {
      res = await provider.send({
        to: s.recipient_email,
        from: settings.sender_email ?? '',
        fromName: settings.sender_name,
        replyTo: settings.reply_to,
        subject: s.subject,
        body: s.body,
        htmlBody: pixel ? textToHtml(s.body, pixel) : null,
        listUnsubscribe: listUnsub?.listUnsubscribe ?? null,
        listUnsubscribePost: listUnsub?.listUnsubscribePost ?? null,
        threadId: prior?.thread_id ?? null,
        inReplyTo: prior?.message_id_header ?? null,
        references: prior?.message_id_header ?? null,
      })
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : 'send failed' }
    }
    if (res.ok) {
      // The email is out — this write MUST land or the row would look retriable
      // and the prospect could be double-emailed. Retry the update, not the send.
      const mark = await updateWithRetry(() =>
        supabase
          .from('outreach_sends')
          .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: res.providerMessageId ?? null, thread_id: res.threadId ?? null, message_id_header: res.messageIdHeader ?? null, updated_at: new Date().toISOString() })
          .eq('id', s.id),
      )
      if (!mark.ok) {
        // Row stays 'sending'; the stale sweep will flip it to 'failed' with a
        // verify-before-requeue note rather than letting it re-send blindly.
        console.error(`[send-worker] EMAIL SENT but could not mark send ${s.id} as sent: ${mark.message}`)
      }
      const { error: draftErr } = await supabase.from('outreach_drafts').update({ status: 'exported' }).eq('id', s.draft_id)
      if (draftErr) console.error(`[send-worker] could not advance draft ${s.draft_id} to exported: ${draftErr.message}`)
      sent++
    } else {
      const mark = await updateWithRetry(() =>
        supabase
          .from('outreach_sends')
          .update({ status: 'failed', error: res.error ?? 'unknown error', updated_at: new Date().toISOString() })
          .eq('id', s.id),
      )
      // On failure the row stays 'sending' and the stale sweep picks it up.
      if (!mark.ok) console.error(`[send-worker] could not mark send ${s.id} as failed: ${mark.message}`)
      failed++
    }
  }
  return { sent, failed, recovered }
}
