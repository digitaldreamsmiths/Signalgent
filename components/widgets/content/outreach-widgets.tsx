'use client'

import { useCallback, useEffect, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import {
  approveDraft,
  approveDrafts,
  editDraft,
  generateFollowup,
  getOutreachSnapshot,
  ingestProspects,
  markExported,
  rejectDraft,
  resolveManual,
  runNewProspects,
  setDisposition,
} from '@/lib/integrations/outreach/actions'
import { queueDraftSend, cancelSend, processSendQueue, scheduleDraftSends, getScheduledSends } from '@/lib/integrations/outreach/sending'
import type { Disposition, OutreachDraftView, OutreachSnapshot, OutreachProspectView, ScheduledSendView } from '@/lib/integrations/outreach/types'
import { hygieneWarnings } from '@/lib/integrations/outreach/hygiene'
import { SendingSettingsModal } from './sending-settings-modal'
import { ScheduledView } from './scheduled-view'
import { ScheduleDialog } from './schedule-dialog'

const ACCENT = '#D85A30'
const BORDER = 'var(--app-border)'
const CARD = 'var(--app-card)'
const MUTED = 'var(--app-muted)'

type Filter = 'review' | 'templates' | 'needs_review' | 'approved' | 'exported' | 'replied' | 'bounced' | 'scheduled' | 'all'

const DISPO_META: Record<Disposition, { label: string; color: string }> = {
  open: { label: 'open', color: 'var(--app-muted)' },
  interested: { label: 'interested', color: '#1D9E75' },
  not_interested: { label: 'not interested', color: '#BA7517' },
  bounced: { label: 'bounced', color: '#b04545' },
  unsubscribed: { label: 'unsubscribed', color: 'var(--app-muted)' },
}

/** Outcome buttons, in funnel order. */
const DISPOSITIONS: { key: Disposition; label: string; color: string }[] = [
  { key: 'interested', label: 'Interested', color: '#1D9E75' },
  { key: 'not_interested', label: 'Not interested', color: '#BA7517' },
  { key: 'bounced', label: 'Bounced', color: '#b04545' },
  { key: 'unsubscribed', label: 'Unsubscribed', color: 'var(--app-muted)' },
]

function fmtPct(frac: number, sent: number): string {
  return sent > 0 ? `${Math.round(frac * 100)}%` : '—'
}

function btn(bg: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: '#fff', background: bg, border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}
function btnGhost(color = 'var(--app-text-2)'): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  // Quote any field with a quote, comma, or newline. Excel keeps a multi-line cell
  // together only when in-cell breaks are a lone LF while ROWS are separated by
  // CRLF (see toCsv). So normalize embedded breaks to "\n" and let the row join add
  // the "\r\n". Normalizing everything to CRLF makes Excel split the body at the
  // first line break (only "Hi," survives).
  return /[",\r\n]/.test(s)
    ? `"${s.replace(/\r\n|\r/g, '\n').replace(/"/g, '""')}"`
    : s
}

/** One row per touch (step) — ready to import into a cold-email platform.
 * A prospect with N touches yields N rows, each carrying its step + subject/body. */
function toCsv(rows: OutreachProspectView[]): string {
  const headers = [
    'email', 'company', 'domain', 'disposition', 'step', 'kind', 'status', 'subject', 'body',
    'location', 'business_types', 'award_count', 'sampled_total',
    'resolution_confidence', 'synthesis_confidence',
  ]
  const lines: string[] = [headers.join(',')]
  for (const p of rows) {
    const touches = p.drafts.length > 0 ? p.drafts : [null]
    for (const d of touches) {
      lines.push([
        p.email,
        p.recipient_name ?? '',
        p.domain ?? '',
        p.disposition,
        d?.step ?? '',
        d ? (d.is_template ? 'template' : 'personalized') : '',
        d?.status ?? '',
        d?.subject ?? '',
        d?.body ?? '',
        p.location ?? '',
        p.business_types.join('; '),
        p.footprint?.award_count ?? '',
        p.footprint?.sampled_total ?? '',
        p.resolution_confidence ?? '',
        d?.synthesis_confidence ?? '',
      ].map(csvCell).join(','))
    }
  }
  return lines.join('\r\n')
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {label}
    </span>
  )
}

/** A compact metric tile for the status bar. Numbers use the mono face. */
function Metric({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent ?? 'var(--app-text)', fontFamily: 'var(--font-mono)', marginTop: 3, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

/** Contextual empty-state copy per filter tab. */
const EMPTY_MSG: Record<Filter, string> = {
  review: 'Nothing waiting for review.',
  templates: 'No template drafts.',
  needs_review: 'Nothing needs a manual match.',
  approved: 'Nothing approved yet — approve drafts from “To review”.',
  exported: 'Nothing exported yet.',
  replied: 'No replies recorded yet.',
  bounced: 'No bounces or unsubscribes.',
  scheduled: 'Nothing scheduled yet.',
  all: 'No drafts yet.',
}

// ── List ──────────────────────────────────────────────────────────────────────

function displayName(p: OutreachProspectView): string {
  return p.recipient_name ?? p.domain ?? p.email
}
const byName = (a: OutreachProspectView, b: OutreachProspectView) =>
  displayName(a).localeCompare(displayName(b))

/** Sticky section divider inside the scrolling list. */
function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--app-card-2)', borderBottom: `1px solid ${BORDER}`, padding: '6px 12px', fontSize: 9, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>
      {label} <span style={{ color: 'var(--app-muted)' }}>{count}</span>
    </div>
  )
}

function ProspectRow({ p, selected, onSelect, checked, onToggle }: { p: OutreachProspectView; selected: boolean; onSelect: () => void; checked?: boolean; onToggle?: () => void }) {
  return (
    <div
      onClick={onSelect}
      style={{ display: 'flex', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', background: selected ? CARD : 'transparent', borderLeft: `2px solid ${selected ? ACCENT : 'transparent'}` }}
    >
      {onToggle && (
        <input type="checkbox" checked={!!checked} onClick={(e) => e.stopPropagation()} onChange={onToggle} style={{ marginTop: 2, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: selected ? 600 : 400, color: 'var(--app-text)' }}>{p.recipient_name ?? p.domain}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{p.email}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {p.needs_review ? <Pill label="review" color="#e0a060" /> : p.draft ? (p.draft.is_template ? <Pill label="template" color={MUTED} /> : <Pill label="personalized" color="#1D9E75" />) : null}
          {p.draft && !p.draft.clean && <Pill label="drift" color="#b04545" />}
          {p.draft?.status === 'approved' && <Pill label="approved" color="#1D9E75" />}
          {p.draft?.status === 'exported' && <Pill label="exported" color="#378ADD" />}
          {p.draft?.send?.status === 'queued' && <Pill label="queued" color={ACCENT} />}
          {p.drafts.length > 1 && <Pill label={`${p.drafts.length} touches`} color={MUTED} />}
          {p.disposition !== 'open' && <Pill label={DISPO_META[p.disposition].label} color={DISPO_META[p.disposition].color} />}
        </div>
      </div>
    </div>
  )
}

// ── Detail pane ───────────────────────────────────────────────────────────────

function touchLabel(step: number): string {
  return step === 1 ? 'Initial email' : `Follow-up ${step - 1}`
}

function fmtWhen(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function sendLabel(send: NonNullable<OutreachDraftView['send']>): string {
  switch (send.status) {
    case 'queued': return `Queued · ${fmtWhen(send.scheduled_at)}`
    case 'sending': return 'Sending…'
    case 'sent': return `Sent · ${fmtWhen(send.sent_at)}`
    case 'failed': return `Send failed: ${send.error ?? 'unknown error'}`
    default: return ''
  }
}

function sendColor(status: string): string {
  if (status === 'sent') return '#378ADD'
  if (status === 'failed') return '#b04545'
  return ACCENT
}

/** One touch (draft) in a prospect's sequence, with its own review actions. */
function TouchCard({ draft, companyId, onChanged }: { draft: OutreachDraftView; companyId: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
      setBusy(true)
      setError(null)
      const r = await fn()
      setBusy(false)
      if (!r.ok) setError(r.error ?? 'Something went wrong.')
      else { after?.(); onChanged() }
    },
    [onChanged],
  )

  const statusColor =
    draft.status === 'approved' ? '#1D9E75' : draft.status === 'rejected' ? '#b04545' : draft.status === 'edited' ? '#BA7517' : draft.status === 'exported' ? '#378ADD' : ACCENT

  const warnings = hygieneWarnings(draft.subject, draft.body)

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, background: CARD, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--app-text-2)' }}>{touchLabel(draft.step)}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {draft.is_template ? <Pill label="template" color={MUTED} /> : <Pill label="personalized" color="#1D9E75" />}
          {!draft.clean && <Pill label="drift" color="#b04545" />}
          {warnings.length > 0 && <Pill label="hygiene" color="#e0a060" />}
          {draft.synthesis_confidence != null && <span style={{ fontSize: 10, color: MUTED }}>fit {draft.synthesis_confidence.toFixed(2)}</span>}
          <Pill label={draft.status} color={statusColor} />
        </div>
      </div>

      {!draft.clean && draft.drifted_facts.length > 0 && (
        <div style={{ fontSize: 11, color: '#d98a8a' }}>Used facts not in the approved set: {draft.drifted_facts.join('; ')}</div>
      )}

      {warnings.length > 0 && (
        <div style={{ fontSize: 11, color: '#e0a060' }}>Deliverability: {warnings.join(' · ')}</div>
      )}

      {editing ? (
        <>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', background: 'var(--app-input)', border: `1px solid ${BORDER}`, borderRadius: 6, color: 'var(--app-text)', fontSize: 12, padding: '6px 8px' }} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} style={{ width: '100%', background: 'var(--app-input)', border: `1px solid ${BORDER}`, borderRadius: 6, color: 'var(--app-text)', fontSize: 12, padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </>
      ) : (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-text-2)', marginBottom: 6 }}>{draft.subject}</div>
          <div style={{ fontSize: 12, color: 'var(--app-text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{draft.body}</div>
        </div>
      )}

      {!draft.is_template && draft.facts_for_draft.length > 0 && (
        <details>
          <summary style={{ fontSize: 11, color: MUTED, cursor: 'pointer' }}>
            Facts ({draft.facts_used.length} of {draft.facts_for_draft.length} used) — traceable to USASpending
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            {draft.facts_for_draft.map((f, i) => {
              const used = draft.facts_used.some((u) => u.trim().toLowerCase() === f.trim().toLowerCase())
              return (
                <div key={i} style={{ fontSize: 11, color: used ? 'var(--app-text-2)' : 'var(--app-muted)' }}>
                  {used ? '✓ ' : '· '}
                  {f}
                </div>
              )
            })}
          </div>
        </details>
      )}

      {error && <div style={{ fontSize: 11, color: '#d98a8a' }}>{error}</div>}

      {draft.send && draft.send.status !== 'canceled' && (
        <div style={{ fontSize: 11, color: sendColor(draft.send.status), display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{sendLabel(draft.send)}</span>
          {draft.send.status === 'queued' && (
            <button disabled={busy} onClick={() => act(() => cancelSend(companyId, draft.send!.id))} style={btnGhost()}>Cancel send</button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {editing ? (
          <>
            <button disabled={busy} onClick={() => act(() => editDraft(companyId, draft.id, subject, body), () => setEditing(false))} style={btn(ACCENT)}>Save</button>
            <button disabled={busy} onClick={() => { setSubject(draft.subject); setBody(draft.body); setEditing(false) }} style={btnGhost()}>Cancel</button>
          </>
        ) : (
          <>
            <button disabled={busy} onClick={() => act(() => approveDraft(companyId, draft.id))} style={btn('#1D9E75')}>Approve</button>
            <button disabled={busy} onClick={() => setEditing(true)} style={btnGhost()}>Edit</button>
            <button disabled={busy} onClick={() => act(() => rejectDraft(companyId, draft.id))} style={btnGhost('#b04545')}>Reject</button>
            {draft.status === 'approved' && (!draft.send || draft.send.status === 'failed' || draft.send.status === 'canceled') && (
              <button disabled={busy} onClick={() => act(() => queueDraftSend(companyId, draft.id))} style={btn(ACCENT)}>Queue to send</button>
            )}
            {draft.status === 'approved' && (
              <button disabled={busy} onClick={() => act(() => markExported(companyId, [draft.id]))} style={btnGhost('#378ADD')}>Mark exported</button>
            )}
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
                setError('Copied subject + body to clipboard.')
              }}
              style={btnGhost()}
            >Copy</button>
          </>
        )}
      </div>
    </div>
  )
}

function DraftDetail({ prospect, companyId, onChanged }: { prospect: OutreachProspectView; companyId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualName, setManualName] = useState('')

  const act = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
      setBusy(true)
      setError(null)
      const r = await fn()
      setBusy(false)
      if (!r.ok) setError(r.error ?? 'Something went wrong.')
      else { after?.(); onChanged() }
    },
    [onChanged],
  )

  const initial = prospect.drafts[0] ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--app-text)' }}>{prospect.recipient_name ?? prospect.domain}</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
            {prospect.email}
            {prospect.business_types.length > 0 && ` · ${prospect.business_types.includes('service_disabled_veteran_owned_business') ? 'SDVOSB' : prospect.business_types.includes('small_business') ? 'Small business' : prospect.business_types[0]}`}
            {prospect.location && ` · ${prospect.location}`}
            {prospect.footprint && ` · ${prospect.footprint.award_count} awards / $${Math.round(prospect.footprint.sampled_total).toLocaleString('en-US')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {prospect.resolution_confidence != null && <span style={{ fontSize: 10, color: MUTED }}>res {prospect.resolution_confidence.toFixed(2)}</span>}
          {prospect.disposition !== 'open' && <Pill label={DISPO_META[prospect.disposition].label} color={DISPO_META[prospect.disposition].color} />}
        </div>
      </div>

      {/* Outcome (recorded manually after send) */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: MUTED, marginRight: 2 }}>Outcome:</span>
        {DISPOSITIONS.map((d) => (
          <button
            key={d.key}
            disabled={busy}
            onClick={() => act(() => setDisposition(companyId, prospect.id, d.key))}
            style={prospect.disposition === d.key ? btn(d.color) : btnGhost(d.color)}
          >
            {d.label}
          </button>
        ))}
        {prospect.disposition !== 'open' && (
          <button disabled={busy} onClick={() => act(() => setDisposition(companyId, prospect.id, 'open'))} style={btnGhost()}>Reopen</button>
        )}
      </div>

      {initial?.is_template && prospect.skip_reason && (
        <div style={{ fontSize: 11, color: MUTED, fontStyle: 'italic' }}>
          Generic template (couldn’t personalize, {prospect.skip_stage}): {prospect.skip_reason}
        </div>
      )}

      {prospect.needs_review && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, background: 'var(--app-card-2)' }}>
          <div style={{ fontSize: 11, color: '#e0a060', marginBottom: 6 }}>
            Uncertain match. Type the correct company name (as it appears in federal records) to re-resolve.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g. Eagle Contractors Inc"
              style={{ flex: 1, background: 'var(--app-input)', border: `1px solid ${BORDER}`, borderRadius: 6, color: 'var(--app-text)', fontSize: 12, padding: '6px 8px' }}
            />
            <button disabled={busy || !manualName.trim()} onClick={() => act(() => resolveManual(companyId, prospect.id, manualName))} style={btn(ACCENT)}>Resolve</button>
          </div>
        </div>
      )}

      {prospect.drafts.length === 0 ? (
        <div style={{ fontSize: 12, color: MUTED }}>No draft for this prospect yet.</div>
      ) : (
        prospect.drafts.map((d) => <TouchCard key={d.id} draft={d} companyId={companyId} onChanged={onChanged} />)
      )}

      {/* Follow-up: generate the next touch on demand (suppressed once closed). */}
      {prospect.drafts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            disabled={busy || prospect.disposition !== 'open'}
            onClick={() => act(() => generateFollowup(companyId, prospect.id))}
            style={btn(ACCENT)}
          >
            {busy ? 'Generating…' : 'Generate follow-up'}
          </button>
          {prospect.disposition !== 'open' && <span style={{ fontSize: 11, color: MUTED }}>Closed — reopen to follow up.</span>}
          {error && <span style={{ fontSize: 11, color: '#d98a8a' }}>{error}</span>}
        </div>
      )}
    </div>
  )
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export function OutreachWorkspace() {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [snapshot, setSnapshot] = useState<OutreachSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ processed: number; total: number; drafted: number; skipped: number; cost: number } | null>(null)
  const [filter, setFilter] = useState<Filter>('review')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sendingModalOpen, setSendingModalOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set())
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduledSends, setScheduledSends] = useState<ScheduledSendView[]>([])

  const refresh = useCallback(async () => {
    if (!companyId) return
    const snap = await getOutreachSnapshot(companyId)
    setSnapshot(snap)
  }, [companyId])

  const loadScheduled = useCallback(async () => {
    if (!companyId) return
    setScheduledSends(await getScheduledSends(companyId))
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    let active = true
    ;(async () => {
      const snap = await getOutreachSnapshot(companyId)
      if (!active) return
      setSnapshot(snap)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [companyId])

  useEffect(() => {
    if (filter === 'scheduled') loadScheduled()
  }, [filter, loadScheduled])

  const handleIngest = useCallback(async () => {
    if (!companyId || !raw.trim()) return
    setNotice(null)
    const r = await ingestProspects(companyId, raw)
    if (!r.ok) return setNotice(r.error)
    setRaw('')
    setNotice(
      `Added ${r.data.added}. ${r.data.duplicates} duplicate(s), ${r.data.invalid} invalid` +
        (r.data.undeliverable > 0 ? `, ${r.data.undeliverable} undeliverable (no mail server)` : '') +
        '.',
    )
    refresh()
  }, [companyId, raw, refresh])

  // Chunked run: processes the queue 5 at a time, updating the progress panel
  // and the live list after each chunk, until the queue drains. This both shows
  // progress and lets lists larger than the per-call cap finish in one click.
  const handleRun = useCallback(async () => {
    if (!companyId) return
    setRunning(true)
    setNotice(null)
    let processed = 0
    let drafted = 0
    let skipped = 0
    let remaining = 0
    let cost = 0
    setProgress({ processed: 0, total: 0, drafted: 0, skipped: 0, cost: 0 })
    for (let guard = 0; guard < 200; guard++) {
      const r = await runNewProspects(companyId, 5)
      if (!r.ok) {
        setNotice(r.error)
        break
      }
      processed += r.data.processed
      drafted += r.data.drafted
      skipped += r.data.skipped
      cost += r.data.cost_usd
      remaining = r.data.remaining
      setProgress({ processed, total: processed + remaining, drafted, skipped, cost })
      await refresh()
      if (r.data.processed === 0 || remaining === 0) break
    }
    setRunning(false)
    setProgress(null)
    setNotice(`Done. ${drafted} personalized, ${skipped} template. ${remaining} remaining. ${fmtUsd(cost)} this run.`)
  }, [companyId, refresh])

  const handleMarkExported = useCallback(
    async (ids: string[]) => {
      if (!companyId || ids.length === 0) return
      setNotice(null)
      const r = await markExported(companyId, ids)
      if (!r.ok) return setNotice(r.error)
      setNotice(`Moved ${r.data.count} draft(s) to Exported.`)
      refresh()
    },
    [companyId, refresh],
  )

  const handleApproveAll = useCallback(
    async (ids: string[]) => {
      if (!companyId || ids.length === 0) return
      setNotice(null)
      const r = await approveDrafts(companyId, ids)
      if (!r.ok) return setNotice(r.error)
      setNotice(`Approved ${r.data.count} draft(s).`)
      refresh()
    },
    [companyId, refresh],
  )

  const handleExport = useCallback((rows: OutreachProspectView[], name: string) => {
    if (rows.length === 0) return
    downloadCsv(`outreach-${name}.csv`, toCsv(rows))
  }, [])

  if (!companyId) return <div style={{ fontSize: 12, color: MUTED }}>Select a company to start outreach.</div>

  const prospects = snapshot?.prospects ?? []
  const c = snapshot?.counts
  const withDraft = prospects.filter((p) => p.draft)
  const lists: Record<Filter, OutreachProspectView[]> = {
    review: withDraft.filter((p) => !p.draft!.is_template && p.draft!.status === 'pending'),
    templates: withDraft.filter((p) => p.draft!.is_template && p.draft!.status === 'pending' && !p.needs_review),
    needs_review: prospects.filter((p) => p.needs_review),
    approved: withDraft.filter((p) => p.draft!.status === 'approved'),
    exported: withDraft.filter((p) => p.draft!.status === 'exported'),
    replied: prospects.filter((p) => p.disposition === 'interested' || p.disposition === 'not_interested'),
    bounced: prospects.filter((p) => p.disposition === 'bounced' || p.disposition === 'unsubscribed'),
    scheduled: [], // the Scheduled tab renders ScheduledView from scheduledSends, not this list
    all: withDraft,
  }
  const current = lists[filter]
  const selected = current.find((p) => p.id === selectedId) ?? current[0] ?? null

  const handleProcessQueue = async () => {
    if (!companyId) return
    setProcessing(true)
    setNotice(null)
    const r = await processSendQueue(companyId)
    setProcessing(false)
    if (!r.ok) return setNotice(r.error)
    setNotice(`Sent ${r.data.sent}${r.data.failed ? `, ${r.data.failed} failed` : ''}.`)
    refresh()
  }

  const toggleDraft = (id: string) =>
    setSelectedDraftIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleSchedule = async (startIso: string) => {
    if (!companyId || selectedDraftIds.size === 0) return
    setScheduling(true)
    setNotice(null)
    const r = await scheduleDraftSends(companyId, [...selectedDraftIds], startIso)
    setScheduling(false)
    if (!r.ok) return setNotice(r.error)
    setNotice(`Scheduled ${r.data.scheduled}${r.data.skipped ? `, ${r.data.skipped} skipped (closed or already queued)` : ''}.`)
    setSelectedDraftIds(new Set())
    setScheduleDialogOpen(false)
    refresh()
    loadScheduled()
  }

  const tab = (key: Filter, label: string, count: number) => (
    <button
      key={key}
      onClick={() => { setFilter(key); setSelectedId(null) }}
      style={{ fontSize: 11, fontWeight: 600, color: filter === key ? ACCENT : MUTED, background: 'transparent', border: 'none', borderBottom: `2px solid ${filter === key ? ACCENT : 'transparent'}`, padding: '4px 8px', cursor: 'pointer' }}
    >
      {label} {count}
    </button>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      {/* Header: title + intake */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--app-text)', margin: 0, marginRight: 4, letterSpacing: 0.2 }}>Outreach</h1>
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Paste contact emails (any separator)…"
          style={{ flex: 1, minWidth: 220, background: 'var(--app-input)', border: `1px solid ${BORDER}`, borderRadius: 6, color: 'var(--app-text)', fontSize: 12, padding: '8px 10px' }}
        />
        <button onClick={handleIngest} disabled={!raw.trim()} style={btn(ACCENT)}>Add prospects</button>
        <button onClick={() => setSendingModalOpen(true)} style={btnGhost()}>Sending</button>
        <button onClick={handleProcessQueue} disabled={processing || (c?.queued ?? 0) === 0} style={btnGhost(ACCENT)}>
          {processing ? 'Processing…' : `Process queue${c?.queued ? ` (${c.queued})` : ''}`}
        </button>
        <button onClick={handleRun} disabled={running || (c?.new ?? 0) === 0} style={btnGhost(ACCENT)}>
          {running ? 'Running…' : `Run enrichment${c?.new ? ` (${c.new})` : ''}`}
        </button>
      </div>

      {/* Status bar */}
      {c && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          <Metric label="To review" value={lists.review.length} accent={ACCENT} />
          <Metric label="Prospects" value={c.total} />
          <Metric label="Sent" value={c.sent} accent="#378ADD" />
          <Metric label="Queued" value={c.queued} accent={c.queued > 0 ? ACCENT : undefined} />
          <Metric label="Replied" value={c.replied} accent="#1D9E75" />
          <Metric label="Reply rate" value={fmtPct(snapshot?.reply_rate ?? 0, c.sent)} />
          <Metric label="API cost" value={fmtUsd(snapshot?.cost_usd_total ?? 0)} />
        </div>
      )}
      {notice && <div style={{ fontSize: 11, color: 'var(--app-text-2)' }}>{notice}</div>}

      {running && progress && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, background: CARD }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--app-text-2)', marginBottom: 6 }}>
            <span>Enriching {progress.processed}{progress.total ? ` of ${progress.total}` : ''}…</span>
            <span style={{ color: MUTED }}>{progress.drafted} personalized · {progress.skipped} template · {fmtUsd(progress.cost)} this run</span>
          </div>
          <div style={{ height: 6, background: 'var(--app-input)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress.total ? Math.round((progress.processed / progress.total) * 100) : 0}%`, background: ACCENT, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {loading && !snapshot && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: MUTED }}>Loading…</div>
      )}
      {!loading && prospects.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--app-text-2)', marginBottom: 4 }}>No prospects yet</div>
            <div style={{ fontSize: 12, color: MUTED }}>Paste a contact list above, then run enrichment to generate drafts.</div>
          </div>
        </div>
      )}

      {prospects.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {tab('review', 'To review', lists.review.length)}
              {tab('templates', 'Templates', lists.templates.length)}
              {tab('needs_review', 'Needs review', lists.needs_review.length)}
              {tab('approved', 'Approved', lists.approved.length)}
              {tab('exported', 'Exported', lists.exported.length)}
              {tab('replied', 'Replied', lists.replied.length)}
              {tab('bounced', 'Bounced', lists.bounced.length)}
              {tab('scheduled', 'Scheduled', c?.queued ?? 0)}
              {tab('all', 'All', lists.all.length)}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, paddingBottom: 4, alignItems: 'center' }}>
              {(filter === 'review' || filter === 'templates') && current.length > 0 && (
                <button onClick={() => handleApproveAll(current.map((p) => p.draft!.id))} style={btn('#1D9E75')}>
                  Approve all ({current.length})
                </button>
              )}
              {filter === 'approved' && current.length > 0 && (
                <button
                  onClick={() => setSelectedDraftIds((prev) => prev.size === current.length ? new Set() : new Set(current.map((p) => p.draft!.id)))}
                  style={btnGhost()}
                >
                  {selectedDraftIds.size === current.length ? 'Clear' : 'Select all'}
                </button>
              )}
              {filter === 'approved' && selectedDraftIds.size > 0 && (
                <button onClick={() => setScheduleDialogOpen(true)} style={btn(ACCENT)}>
                  Schedule ({selectedDraftIds.size})
                </button>
              )}
              {filter === 'approved' && current.length > 0 && (
                <button onClick={() => handleMarkExported(current.map((p) => p.draft!.id))} style={btnGhost('#378ADD')}>
                  Mark all exported
                </button>
              )}
              {filter !== 'scheduled' && current.length > 0 && (
                <button onClick={() => handleExport(current, filter)} style={btnGhost(ACCENT)}>
                  Export CSV ({current.length})
                </button>
              )}
            </div>
          </div>

          {filter === 'scheduled' ? (
            companyId && (
              <ScheduledView companyId={companyId} sends={scheduledSends} onChanged={() => { loadScheduled(); refresh() }} />
            )
          ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 300px) minmax(0, 1fr)', gap: 14 }}>
            {/* List */}
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
              {current.length === 0 && <div style={{ fontSize: 12, color: MUTED, padding: 14 }}>{EMPTY_MSG[filter]}</div>}
              {current.length > 0 && (filter === 'approved' || filter === 'exported' || filter === 'all') ? (
                // Split into Personalized then Templates, each sorted by name.
                (() => {
                  const personalized = current.filter((p) => p.draft && !p.draft.is_template).sort(byName)
                  const templates = current.filter((p) => p.draft && p.draft.is_template).sort(byName)
                  const selectable = filter === 'approved'
                  const rowOf = (p: OutreachProspectView) => (
                    <ProspectRow
                      key={p.id}
                      p={p}
                      selected={selected?.id === p.id}
                      onSelect={() => setSelectedId(p.id)}
                      checked={selectable && p.draft ? selectedDraftIds.has(p.draft.id) : undefined}
                      onToggle={selectable && p.draft ? () => toggleDraft(p.draft!.id) : undefined}
                    />
                  )
                  return (
                    <>
                      {personalized.length > 0 && <SectionHeader label="Personalized" count={personalized.length} />}
                      {personalized.map(rowOf)}
                      {templates.length > 0 && <SectionHeader label="Templates" count={templates.length} />}
                      {templates.map(rowOf)}
                    </>
                  )
                })()
              ) : (
                current.map((p) => (
                  <ProspectRow key={p.id} p={p} selected={selected?.id === p.id} onSelect={() => setSelectedId(p.id)} />
                ))
              )}
            </div>

            {/* Detail */}
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflowY: 'auto', minHeight: 0, padding: 16 }}>
              {selected ? (
                <DraftDetail key={selected.id} prospect={selected} companyId={companyId} onChanged={refresh} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--app-muted)', marginBottom: 4 }}>No draft selected</div>
                    <div style={{ fontSize: 11, color: MUTED }}>Pick a prospect from the list to review, edit, and approve its draft.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </>
      )}

      {sendingModalOpen && companyId && (
        <SendingSettingsModal companyId={companyId} onClose={() => setSendingModalOpen(false)} onSaved={refresh} />
      )}

      {scheduleDialogOpen && (
        <ScheduleDialog
          count={selectedDraftIds.size}
          busy={scheduling}
          onConfirm={handleSchedule}
          onClose={() => setScheduleDialogOpen(false)}
        />
      )}
    </div>
  )
}
