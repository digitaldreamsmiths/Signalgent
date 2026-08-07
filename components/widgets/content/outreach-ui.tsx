'use client'

/**
 * Small presentational pieces shared by the outreach chrome (which lives in the
 * layout) and the section views (which live in the routes). Extracted when the
 * chrome was hoisted so neither file has to import the other.
 */

export const ACCENT = '#D85A30'
export const BORDER = 'var(--app-border)'
export const CARD = 'var(--app-card)'
export const MUTED = 'var(--app-muted)'

export function fmtPct(frac: number, sent: number): string {
  return sent > 0 ? `${Math.round(frac * 100)}%` : '—'
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`
}

export function btn(bg: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: '#fff', background: bg, border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}

export function btnGhost(color = 'var(--app-text-2)'): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}

export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {label}
    </span>
  )
}

/** Prominent full-width alert for pipeline-stopping states (paused, Gmail broken). */
export function Banner({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color, background: 'var(--app-card-2)', border: `1px solid ${color}`, borderRadius: 8, padding: '8px 12px' }}>
      {children}
    </div>
  )
}

/** A compact metric tile for the status bar. Numbers use the mono face. */
export function Metric({ label, value, accent, hint }: { label: string; value: string | number; accent?: string; hint?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' }} title={hint}>
      <div style={{ fontSize: 9, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent ?? 'var(--app-text)', fontFamily: 'var(--font-mono)', marginTop: 3, lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: 9, color: MUTED, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hint}</div>}
    </div>
  )
}
