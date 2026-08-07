'use client'

import { useEffect, useState } from 'react'
import { getSetupStatus, type SetupStatus, type SetupStep } from '@/lib/integrations/outreach/setup-status'

const BORDER = 'var(--app-border)'
const CARD = 'var(--app-card)'
const MUTED = 'var(--app-muted)'
const ACCENT = '#D85A30'

const STATE_META = {
  done: { color: '#1D9E75', mark: '✓' },
  warn: { color: '#e0a060', mark: '!' },
  todo: { color: MUTED, mark: '○' },
} as const

const ACTION_LABEL: Record<NonNullable<SetupStep['action']>, string> = {
  offer_profile: 'Open offer profile',
  connections: 'Open connections',
  sending_settings: 'Open sending settings',
  add_prospects: 'Add prospects',
}

/**
 * First-run setup checklist. Shown until every required step is done, then it
 * collapses to a one-line summary the user can reopen. Non-blocking on purpose:
 * the dense workspace stays available for people who know what they're doing.
 */
export function SetupChecklist({ companyId, refreshKey, onAction }: {
  companyId: string
  /** Bump to recompute after the user changes something. */
  refreshKey: number
  onAction: (action: NonNullable<SetupStep['action']>) => void
}) {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  // null = follow the default (expanded while there's work left, collapsed once
  // done); a boolean means the user chose, and their choice sticks.
  const [open, setOpen] = useState<boolean | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const s = await getSetupStatus(companyId)
      if (active) setStatus(s)
    })()
    return () => { active = false }
  }, [companyId, refreshKey])

  if (!status || dismissed) return null

  const remaining = status.steps.filter((s) => s.state !== 'done' && s.key !== 'auth').length
  const attention = status.steps.filter((s) => s.state === 'warn').length
  const expanded = open ?? !status.complete

  // Fully set up and collapsed: one quiet line, rather than a wall of green.
  if (status.complete && !expanded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 12px', background: CARD }}>
        <span style={{ fontSize: 11, color: attention > 0 ? '#e0a060' : '#1D9E75', fontWeight: 700 }}>{attention > 0 ? '!' : '✓'}</span>
        <span style={{ fontSize: 11, color: 'var(--app-text-2)' }}>
          Setup complete{attention > 0 ? ` — ${attention} thing${attention === 1 ? '' : 's'} worth a look` : ''}.
        </span>
        <button onClick={() => setOpen(true)} style={linkBtn}>Review</button>
        <button onClick={() => setDismissed(true)} style={{ ...linkBtn, marginLeft: 'auto' }}>Hide</button>
      </div>
    )
  }

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, background: CARD, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: expanded ? `1px solid ${BORDER}` : 'none' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--app-text)' }}>
          {status.complete ? 'Outreach setup' : 'Finish setting up outreach'}
        </span>
        <span style={{ fontSize: 11, color: MUTED }}>
          {status.complete ? (attention > 0 ? `${attention} worth a look` : 'All set') : `${remaining} step${remaining === 1 ? '' : 's'} left`}
        </span>
        <button onClick={() => setOpen(!expanded)} style={{ ...linkBtn, marginLeft: 'auto' }}>{expanded ? 'Hide' : 'Show'}</button>
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {status.steps.map((s) => {
            const meta = STATE_META[s.state]
            return (
              <div key={s.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 12px', borderTop: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, lineHeight: 1.4, width: 12, flexShrink: 0 }}>{meta.mark}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: s.state === 'done' ? MUTED : 'var(--app-text)' }}>{s.title}</span>
                    {s.detail && <span style={{ fontSize: 10, color: s.state === 'warn' ? '#e0a060' : MUTED }}>{s.detail}</span>}
                  </div>
                  {s.state !== 'done' && (
                    <div style={{ fontSize: 11, color: 'var(--app-text-2)', marginTop: 3, lineHeight: 1.45 }}>{s.why}</div>
                  )}
                </div>
                {s.state !== 'done' && s.action && (
                  <button onClick={() => onAction(s.action!)} style={{ fontSize: 11, fontWeight: 600, color: ACCENT, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {ACTION_LABEL[s.action]}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const linkBtn: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: MUTED, background: 'transparent',
  border: 'none', cursor: 'pointer', padding: '2px 4px', minHeight: 'auto',
}
