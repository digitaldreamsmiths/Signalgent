'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cancelSends, rescheduleSends } from '@/lib/integrations/outreach/sending'
import type { ScheduledSendView } from '@/lib/integrations/outreach/types'
import { ScheduleDialog } from './schedule-dialog'

const BORDER = 'var(--app-border)'
const CARD = 'var(--app-card)'
const CARD2 = 'var(--app-card-2)'
const TEXT = 'var(--app-text)'
const TEXT2 = 'var(--app-text-2)'
const MUTED = 'var(--app-muted)'
const ACCENT = '#D85A30'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
function fmtTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
function fmtDayHeader(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

export function ScheduledView({ companyId, sends, onChanged }: { companyId: string; sends: ScheduledSendView[]; onChanged: () => void }) {
  const today = new Date()
  const [view, setView] = useState<{ y: number; m: number }>({ y: today.getFullYear(), m: today.getMonth() })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // On first populated load, jump the grid to the earliest scheduled send's month
  // so sends that land in a future month aren't hidden behind the current one.
  // Guarded so it never fights the user's own month navigation afterward.
  const jumped = useRef(false)
  useEffect(() => {
    if (jumped.current || sends.length === 0) return
    const earliest = sends
      .map((s) => (s.scheduled_at ? new Date(s.scheduled_at) : null))
      .filter((d): d is Date => !!d && !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())[0]
    if (earliest) {
      setView({ y: earliest.getFullYear(), m: earliest.getMonth() })
      jumped.current = true
    }
  }, [sends])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const countByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sends) {
      if (!s.scheduled_at) continue
      const k = dayKey(new Date(s.scheduled_at))
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [sends])

  const visible = useMemo(() => {
    const list = selectedDay ? sends.filter((s) => s.scheduled_at && dayKey(new Date(s.scheduled_at)) === selectedDay) : sends
    return list
  }, [sends, selectedDay])

  const grouped = useMemo(() => {
    const g = new Map<string, ScheduledSendView[]>()
    for (const s of visible) {
      const k = s.scheduled_at ? dayKey(new Date(s.scheduled_at)) : 'unscheduled'
      if (!g.has(k)) g.set(k, [])
      g.get(k)!.push(s)
    }
    return [...g.entries()]
  }, [visible])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Toggle a whole group (a day, or everything visible) in one click. */
  function toggleMany(items: ScheduledSendView[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const s of items) {
        if (on) next.add(s.id)
        else next.delete(s.id)
      }
      return next
    })
  }
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.id))

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    setError(null)
    const r = await fn()
    setBusy(false)
    if (!r.ok) return setError(r.error ?? 'Something went wrong.')
    setSelected(new Set())
    setDialogOpen(false)
    onChanged()
  }

  // Build the month grid.
  const first = new Date(view.y, view.m, 1)
  const lead = first.getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedIds = [...selected]

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 340px) minmax(0, 1fr)', gap: 14 }}>
      {/* Calendar */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, alignSelf: 'start' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))} style={navBtn}>‹</button>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{MONTHS[view.m]} {view.y}</div>
          <button onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))} style={navBtn}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {DOW.map((d, i) => <div key={i} style={{ fontSize: 9, fontWeight: 600, color: MUTED, textAlign: 'center', padding: '2px 0' }}>{d}</div>)}
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />
            const key = `${view.y}-${view.m + 1}-${day}`
            const count = countByDay.get(key) ?? 0
            const isSel = selectedDay === key
            const isToday = key === dayKey(today)
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isSel ? null : key)}
                style={{
                  aspectRatio: '1', borderRadius: 6, cursor: 'pointer', position: 'relative',
                  border: `1px solid ${isSel ? ACCENT : isToday ? MUTED : 'transparent'}`,
                  background: count > 0 ? 'rgba(216,90,48,0.12)' : 'transparent',
                  color: count > 0 ? TEXT : MUTED, fontSize: 11, padding: 0,
                }}
              >
                <span>{day}</span>
                {count > 0 && (
                  <span style={{ position: 'absolute', bottom: 2, left: 0, right: 0, fontSize: 8, fontWeight: 700, color: ACCENT }}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
        {selectedDay && (
          <button onClick={() => setSelectedDay(null)} style={{ ...navBtn, width: '100%', marginTop: 10, fontSize: 11 }}>Show all days</button>
        )}
      </div>

      {/* Day-grouped list */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {visible.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            {/* When a calendar day is picked, `visible` is that day only — so this
                doubles as "select the whole day". */}
            <button disabled={busy} onClick={() => toggleMany(visible, !allVisibleSelected)} style={btnGhost(TEXT2)}>
              {allVisibleSelected ? 'Clear' : `Select all (${visible.length})`}
            </button>
            {selectedIds.length > 0 && (
              <>
                <span style={{ fontSize: 11, color: TEXT2 }}>{selectedIds.length} selected</span>
                <button disabled={busy} onClick={() => setDialogOpen(true)} style={btn(ACCENT)}>Reschedule…</button>
                <button disabled={busy} onClick={() => act(() => cancelSends(companyId, selectedIds))} style={btnGhost('#b04545')}>Cancel sends</button>
              </>
            )}
            {error && <span style={{ fontSize: 11, color: '#d98a8a' }}>{error}</span>}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          {visible.length === 0 && <div style={{ fontSize: 12, color: MUTED, padding: 14 }}>Nothing scheduled{selectedDay ? ' that day' : ' yet'}.</div>}
          {grouped.map(([key, items]) => {
            const dayAllSelected = items.every((s) => selected.has(s.id))
            return (
            <div key={key}>
              <label style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, background: CARD2, borderBottom: `1px solid ${BORDER}`, padding: '6px 12px', fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer' }} title="Select every send on this day">
                <input type="checkbox" checked={dayAllSelected} onChange={() => toggleMany(items, !dayAllSelected)} />
                <span>{fmtDayHeader(key)} <span style={{ color: ACCENT }}>{items.length}</span></span>
              </label>
              {items.map((s) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', background: selected.has(s.id) ? CARD : 'transparent' }}>
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.recipient_name ?? s.recipient_email}</div>
                    <div style={{ fontSize: 10, color: MUTED }}>{s.recipient_email}</div>
                  </div>
                  <div style={{ fontSize: 11, color: TEXT2, fontFamily: 'var(--font-mono)' }}>{fmtTime(s.scheduled_at)}</div>
                </label>
              ))}
            </div>
            )
          })}
        </div>
      </div>

      {dialogOpen && (
        <ScheduleDialog
          count={selectedIds.length}
          confirmLabel="Reschedule"
          busy={busy}
          error={error}
          onConfirm={(iso) => act(() => rescheduleSends(companyId, selectedIds, iso))}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = { fontSize: 14, color: MUTED, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '2px 10px', cursor: 'pointer' }
function btn(bg: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: '#fff', background: bg, border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}
function btnGhost(color: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}
