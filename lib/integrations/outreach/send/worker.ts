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

type DB = SupabaseClient<Database>

/** Per-tick cap on how many due emails the worker sends. */
const BATCH = 10

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
  }
}

// ── Timezone helpers (no date lib; DST edge cases acceptable for scheduling) ──

interface Wall { y: number; mo: number; d: number; h: number; mi: number; weekday: number }

function parseHM(hm: string): [number, number] {
  const [h, m] = hm.split(':').map((n) => parseInt(n, 10))
  return [h || 0, m || 0]
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

/**
 * The next available send slot: after the last planned send + min gap, clamped
 * into the Mon–Fri business-hours window, rolling to the next day once the daily
 * cap is hit. Returns an ISO string.
 */
export async function nextSlot(supabase: DB, companyId: string, settings: SendSettings): Promise<string> {
  const tz = settings.timezone
  const [wsH, wsM] = parseHM(settings.send_window_start)
  const [weH, weM] = parseHM(settings.send_window_end)
  const now = new Date()

  const { data: rows } = await supabase
    .from('outreach_sends')
    .select('scheduled_at')
    .eq('company_id', companyId)
    .in('status', ['queued', 'sending', 'sent'])
    .not('scheduled_at', 'is', null)
  const planned = (rows ?? []).map((r) => new Date(r.scheduled_at as string))
  const counts = new Map<string, number>()
  let lastT = 0
  for (const d of planned) {
    const w = wallParts(d, tz)
    const key = `${w.y}-${w.mo}-${w.d}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    lastT = Math.max(lastT, d.getTime())
  }

  const afterLast = lastT ? lastT + settings.min_gap_minutes * 60000 : now.getTime()
  let slot = new Date(Math.max(now.getTime(), afterLast))

  for (let i = 0; i < 500; i++) {
    const w = wallParts(slot, tz)
    if (w.weekday === 0 || w.weekday === 6) { slot = nextDayWindowStart(w, tz, wsH, wsM); continue }
    const winStart = fromZonedWall(w.y, w.mo, w.d, wsH, wsM, tz)
    const winEnd = fromZonedWall(w.y, w.mo, w.d, weH, weM, tz)
    if (slot.getTime() < winStart.getTime()) slot = winStart
    if (slot.getTime() >= winEnd.getTime()) { slot = nextDayWindowStart(w, tz, wsH, wsM); continue }
    const key = `${w.y}-${w.mo}-${w.d}`
    if ((counts.get(key) ?? 0) >= settings.daily_send_limit) { slot = nextDayWindowStart(w, tz, wsH, wsM); continue }
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
  const { data: rows } = await supabase
    .from('outreach_sends')
    .select('id, scheduled_at')
    .eq('company_id', companyId)
    .in('status', ['queued', 'sending', 'sent'])
    .not('scheduled_at', 'is', null)
  const counts = new Map<string, number>()
  for (const r of rows ?? []) {
    if (exclude.has(r.id)) continue // rows being rescheduled shouldn't count against themselves
    const w = wallParts(new Date(r.scheduled_at as string), tz)
    const key = `${w.y}-${w.mo}-${w.d}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const slots: string[] = []
  for (let i = 0; i < count; i++) {
    // Roll forward over any day that's already at capacity.
    for (let guard = 0; guard < 800; guard++) {
      const w = wallParts(cur, tz)
      if ((counts.get(`${w.y}-${w.mo}-${w.d}`) ?? 0) < settings.daily_send_limit) break
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

/**
 * Send the due, queued emails for a company (one tick). `scheduled_at` is the
 * source of truth for timing (set by auto-slotting or explicit user scheduling),
 * so the worker simply sends whatever is due — no business-hours gate here.
 * Re-checks suppression, marks sending → sent/failed, advances the sent draft to
 * 'exported'. No-ops when sending is inactive.
 */
export async function runQueue(supabase: DB, companyId: string): Promise<{ sent: number; failed: number }> {
  const settings = await loadSettings(supabase, companyId)
  if (!settings.active) return { sent: 0, failed: 0 }

  let provider
  try {
    provider = getProvider(settings.provider as ProviderName, { companyId, supabase })
  } catch {
    return { sent: 0, failed: 0 } // misconfigured provider — nothing to do this tick
  }

  const { data: due } = await supabase
    .from('outreach_sends')
    .select('id, draft_id, prospect_id, recipient_email, subject, body')
    .eq('company_id', companyId)
    .eq('status', 'queued')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(BATCH)

  let sent = 0
  let failed = 0
  for (const s of due ?? []) {
    // Suppression re-check at send time.
    const { data: p } = await supabase.from('outreach_prospects').select('disposition').eq('id', s.prospect_id).maybeSingle()
    if (p && p.disposition !== 'open') {
      await supabase.from('outreach_sends').update({ status: 'canceled', error: 'prospect closed before send' }).eq('id', s.id)
      continue
    }
    await supabase.from('outreach_sends').update({ status: 'sending' }).eq('id', s.id)
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
    let res
    try {
      res = await provider.send({
        to: s.recipient_email,
        from: settings.sender_email ?? '',
        fromName: settings.sender_name,
        replyTo: settings.reply_to,
        subject: s.subject,
        body: s.body,
        threadId: prior?.thread_id ?? null,
        inReplyTo: prior?.message_id_header ?? null,
        references: prior?.message_id_header ?? null,
      })
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : 'send failed' }
    }
    if (res.ok) {
      await supabase.from('outreach_sends').update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: res.providerMessageId ?? null, thread_id: res.threadId ?? null, message_id_header: res.messageIdHeader ?? null }).eq('id', s.id)
      await supabase.from('outreach_drafts').update({ status: 'exported' }).eq('id', s.draft_id)
      sent++
    } else {
      await supabase.from('outreach_sends').update({ status: 'failed', error: res.error ?? 'unknown error' }).eq('id', s.id)
      failed++
    }
  }
  return { sent, failed }
}
