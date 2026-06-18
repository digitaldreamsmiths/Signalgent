'use client'

import { useState } from 'react'

const BORDER = 'var(--app-border)'
const CARD = 'var(--app-card)'
const INPUT = 'var(--app-input)'
const TEXT = 'var(--app-text)'
const MUTED = 'var(--app-muted)'
const ACCENT = '#D85A30'

/** Next weekday at 09:00, as separate date (YYYY-MM-DD) + time (HH:MM) strings. */
function defaultStart(): { date: string; time: string } {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: '09:00' }
}

export function ScheduleDialog({
  count,
  gapMinutes,
  dailyLimit,
  busy,
  error,
  confirmLabel = 'Schedule',
  onConfirm,
  onClose,
}: {
  count: number
  gapMinutes?: number
  dailyLimit?: number
  busy?: boolean
  error?: string | null
  confirmLabel?: string
  onConfirm: (startIso: string) => void
  onClose: () => void
}) {
  const init = defaultStart()
  const [date, setDate] = useState(init.date)
  const [time, setTime] = useState(init.time)

  const startDate = date && time ? new Date(`${date}T${time}`) : null
  const valid = !!startDate && !isNaN(startDate.getTime())
  const whenLabel = valid
    ? startDate!.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—'

  const inputStyle: React.CSSProperties = { background: INPUT, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, padding: '7px 9px' }

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[16vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 380, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0 }}>{confirmLabel} {count} email{count === 1 ? '' : 's'}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Start date</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ width: 110 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Time</div>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
        </div>

        <div style={{ fontSize: 11, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
          {count} email{count === 1 ? '' : 's'} starting <span style={{ color: TEXT }}>{whenLabel}</span>
          {gapMinutes ? `, ~${gapMinutes} min apart` : ''}
          {dailyLimit ? `, up to ${dailyLimit}/day (overflow rolls to the next day).` : '.'}
        </div>

        {error && <div style={{ fontSize: 11, color: '#d98a8a', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ fontSize: 12, fontWeight: 600, color: MUTED, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 14px', cursor: 'pointer' }}>Cancel</button>
          <button
            disabled={busy || !valid}
            onClick={() => valid && onConfirm(startDate!.toISOString())}
            style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: ACCENT, border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', opacity: busy || !valid ? 0.6 : 1 }}
          >
            {busy ? 'Scheduling…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
