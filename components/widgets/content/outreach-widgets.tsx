'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import {
  approveDraft,
  approveDrafts,
  deleteProspects,
  editDraft,
  generateFollowup,
  getOutreachSnapshot,
  ingestProspects,
  markExported,
  processProspects,
  rejectDraft,
  resolveManual,
  enrichWaveNow,
  setDisposition,
} from '@/lib/integrations/outreach/actions'
import { queueDraftSend, cancelSend, processSendQueue, scheduleDraftSends, getScheduledSends, scanRepliesNow } from '@/lib/integrations/outreach/sending'
import type { Disposition, OutreachDraftView, OutreachSnapshot, OutreachProspectView, ScheduledSendView } from '@/lib/integrations/outreach/types'
import { hygieneWarnings, replyRiskWarnings } from '@/lib/integrations/outreach/hygiene'
import { SendingSettingsModal } from './sending-settings-modal'
import { TemplatesModal } from './templates-modal'
import { ScheduledView } from './scheduled-view'
import { ScheduleDialog } from './schedule-dialog'

const ACCENT = '#D85A30'
const BORDER = 'var(--app-border)'
const CARD = 'var(--app-card)'
const MUTED = 'var(--app-muted)'

type Filter = 'contacts' | 'review' | 'templates' | 'needs_review' | 'approved' | 'exported' | 'replied' | 'bounced' | 'scheduled' | 'all'

/** Sort keys for the draft lists (Ready to email / Sent / All). 'type' is the
 * default and keeps the grouped Personalized/Templates sections; the rest
 * flatten the list. */
type ListSortKey = 'type' | 'name' | 'email' | 'status'

const DISPO_META: Record<Disposition, { label: string; color: string }> = {
  open: { label: 'open', color: 'var(--app-muted)' },
  replied: { label: 'replied', color: '#378ADD' },
  interested: { label: 'interested', color: '#1D9E75' },
  not_interested: { label: 'not interested', color: '#BA7517' },
  bounced: { label: 'bounced', color: '#b04545' },
  unsubscribed: { label: 'opt-out', color: '#b04545' },
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

/** Prominent full-width alert for pipeline-stopping states (paused, Gmail broken). */
function Banner({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color, background: 'var(--app-card-2)', border: `1px solid ${color}`, borderRadius: 8, padding: '8px 12px' }}>
      {children}
    </div>
  )
}

/** A compact metric tile for the status bar. Numbers use the mono face. */
function Metric({ label, value, accent, hint }: { label: string; value: string | number; accent?: string; hint?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' }} title={hint}>
      <div style={{ fontSize: 9, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent ?? 'var(--app-text)', fontFamily: 'var(--font-mono)', marginTop: 3, lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: 9, color: MUTED, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hint}</div>}
    </div>
  )
}

/** Contextual empty-state copy per filter tab. */
const EMPTY_MSG: Record<Filter, string> = {
  contacts: 'No contacts yet — paste or upload emails above.',
  review: 'Nothing waiting for review.',
  templates: 'No template drafts waiting — templates are auto-approved and go straight to “Ready to email”.',
  needs_review: 'Nothing needs a manual match.',
  approved: 'Nothing ready to email yet — approve drafts from “To review” (templates land here automatically).',
  exported: 'Nothing sent yet.',
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

/** Row state for the Status sort — the send status once queued, else the draft
 * status, so queued rows group together ahead of the un-scheduled ones. */
function rowStage(p: OutreachProspectView): string {
  return p.draft?.send?.status ?? p.draft?.status ?? ''
}

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

// ── Contacts table ──────────────────────────────────────────────────────────

type ContactSortKey = 'email' | 'name' | 'domain' | 'status' | 'added'
type StageBucket = 'new' | 'review' | 'ready' | 'emailed' | 'replied' | 'other'
type ContactFilter = 'all' | StageBucket

/** Free / consumer webmail domains — these get no website link in the Domain
 * column (there's no business site behind them) and are still shown as plain text. */
const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.ca', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru', 'fastmail.com', 'hey.com',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net', 'earthlink.net',
  'qq.com', '163.com', '126.com',
])

function isFreeProvider(domain: string | null): boolean {
  return !!domain && FREE_PROVIDERS.has(domain.toLowerCase())
}

/** Collapse a prospect's full lifecycle — enrichment status + latest draft +
 * send + disposition — into a single badge for the Contacts list. More advanced /
 * terminal states win, so a row reads as the furthest point it has reached. */
function contactStage(p: OutreachProspectView): { label: string; color: string } {
  if (p.disposition === 'bounced') return { label: 'Bounced', color: '#b04545' }
  if (p.disposition === 'unsubscribed') return { label: 'Opt-out ✋', color: '#b04545' }
  if (p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested') return { label: 'Replied', color: '#378ADD' }
  if (p.needs_review) return { label: 'Needs review', color: '#e0a060' }

  // Emailed = any touch actually sent or marked exported to the sending tool.
  if (p.drafts.some((d) => d.status === 'exported' || d.send?.status === 'sent')) return { label: 'Emailed', color: '#378ADD' }

  const send = p.draft?.send
  if (send?.status === 'sending') return { label: 'Sending', color: ACCENT }
  if (send?.status === 'queued') return { label: 'Queued', color: ACCENT }

  const ds = p.draft?.status
  if (ds === 'approved' || ds === 'edited') return { label: 'Ready to email', color: '#1D9E75' }
  if (ds === 'rejected') return { label: 'Rejected', color: '#BA7517' }
  if (ds === 'pending') return p.draft!.is_template ? { label: 'Template', color: MUTED } : { label: 'In review', color: '#1D9E75' }

  switch (p.status) {
    case 'skipped': return { label: 'Skipped', color: '#BA7517' }
    case 'error': return { label: 'Error', color: '#b04545' }
    case 'enriched': return { label: 'Enriched', color: '#378ADD' }
    case 'drafted': return { label: 'Drafted', color: '#1D9E75' }
    default: return { label: 'New', color: MUTED }
  }
}

/** Coarse bucket for the Contacts status filter (the label from contactStage is
 * finer-grained than the filter needs). */
function stageBucket(p: OutreachProspectView): StageBucket {
  if (p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested') return 'replied'
  if (p.disposition === 'bounced' || p.disposition === 'unsubscribed') return 'other'
  if (p.needs_review) return 'review'
  if (p.drafts.some((d) => d.status === 'exported' || d.send?.status === 'sent')) return 'emailed'
  const send = p.draft?.send
  if (send?.status === 'queued' || send?.status === 'sending') return 'ready'
  const ds = p.draft?.status
  if (ds === 'approved' || ds === 'edited') return 'ready'
  if (ds === 'pending') return p.draft!.is_template ? 'other' : 'review'
  if (p.status === 'new') return 'new'
  return 'other'
}

const CONTACT_FILTERS: { key: ContactFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'review', label: 'In review' },
  { key: 'ready', label: 'Ready' },
  { key: 'emailed', label: 'Emailed' },
  { key: 'replied', label: 'Replied' },
  { key: 'other', label: 'Other' },
]

/** Master list of every ingested email — visible before enrichment, sortable by
 * any column, with per-row and bulk delete. This is the only place raw `new`
 * prospects (no draft yet) surface, since the workflow tabs all require a draft. */
function ContactsTable({ prospects, companyId, onChanged }: { prospects: OutreachProspectView[]; companyId: string; onChanged: () => void }) {
  const [sortKey, setSortKey] = useState<ContactSortKey>('added')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [proc, setProc] = useState<{ done: number; total: number; drafted: number; skipped: number } | null>(null)
  const [procError, setProcError] = useState<string | null>(null)
  const cancelProc = useRef(false)
  const [stageF, setStageF] = useState<ContactFilter>('all')

  // Only `new` prospects can be enriched; already-processed rows in the selection
  // are silently ignored so a "select all → Process" does the right thing.
  const statusById = new Map(prospects.map((p) => [p.id, p.status]))
  const selectedNew = [...selected].filter((id) => statusById.get(id) === 'new')

  const dir = sortDir === 'asc' ? 1 : -1
  const cmp = (a: OutreachProspectView, b: OutreachProspectView): number => {
    switch (sortKey) {
      case 'email': return a.email.localeCompare(b.email)
      case 'name': return (a.recipient_name ?? '').localeCompare(b.recipient_name ?? '')
      case 'domain': return (a.domain ?? '').localeCompare(b.domain ?? '')
      case 'status': return contactStage(a).label.localeCompare(contactStage(b).label)
      case 'added': return a.created_at.localeCompare(b.created_at)
    }
  }
  const sorted = [...prospects].sort((a, b) => cmp(a, b) * dir)
  const visible = stageF === 'all' ? sorted : sorted.filter((p) => stageBucket(p) === stageF)

  // Count per bucket for the filter chips (drop empty ones except All/New).
  const bucketCounts = prospects.reduce<Record<StageBucket, number>>(
    (acc, p) => { acc[stageBucket(p)] += 1; return acc },
    { new: 0, review: 0, ready: 0, emailed: 0, replied: 0, other: 0 },
  )
  const countFor = (k: ContactFilter): number => (k === 'all' ? prospects.length : bucketCounts[k])

  const toggleSort = (k: ContactSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'added' ? 'desc' : 'asc') }
  }

  const allChecked = visible.length > 0 && visible.every((p) => selected.has(p.id))
  const toggleAll = () => {
    setConfirmBulk(false)
    setSelected((prev) => {
      const n = new Set(prev)
      if (allChecked) visible.forEach((p) => n.delete(p.id))
      else visible.forEach((p) => n.add(p.id))
      return n
    })
  }
  const toggleOne = (id: string) => {
    setConfirmBulk(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const del = async (ids: string[]) => {
    if (ids.length === 0) return
    setBusy(true)
    await deleteProspects(companyId, ids)
    setBusy(false)
    setConfirmId(null)
    setConfirmBulk(false)
    setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n })
    onChanged()
  }

  // Enrich the selected `new` prospects, one RUN_BATCH at a time, until the
  // selection drains or the user cancels. onChanged() after each batch refreshes
  // the snapshot so processed contacts flow into "To review" live.
  const process = async () => {
    const initial = selectedNew
    if (initial.length === 0) return
    cancelProc.current = false
    setProcError(null)
    setBusy(true)
    setProc({ done: 0, total: initial.length, drafted: 0, skipped: 0 })
    let pending = initial
    let done = 0, drafted = 0, skipped = 0
    while (pending.length > 0 && !cancelProc.current) {
      const r = await processProspects(companyId, pending)
      if (!r.ok) { setProcError(r.error); break }
      if (r.data.processed === 0) break
      const doneSet = new Set(r.data.processedIds)
      pending = pending.filter((id) => !doneSet.has(id))
      done += r.data.processed
      drafted += r.data.drafted
      skipped += r.data.skipped
      setProc({ done, total: initial.length, drafted, skipped })
      setSelected((prev) => { const n = new Set(prev); doneSet.forEach((id) => n.delete(id)); return n })
      onChanged()
    }
    setBusy(false)
    setProc(null)
    cancelProc.current = false
  }

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 9, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, padding: '8px 12px', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 12, color: 'var(--app-text)', padding: '8px 12px', borderTop: `1px solid ${BORDER}` }
  const caret = (k: ContactSortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', borderBottom: `1px solid ${BORDER}`, background: 'var(--app-card-2)' }}>
        {CONTACT_FILTERS.filter((f) => f.key === 'all' || f.key === 'new' || countFor(f.key) > 0).map((f) => {
          const on = stageF === f.key
          return (
            <button
              key={f.key}
              onClick={() => setStageF(f.key)}
              style={{ fontSize: 11, fontWeight: 600, color: on ? '#fff' : 'var(--app-text-2)', background: on ? ACCENT : 'transparent', border: `1px solid ${on ? ACCENT : BORDER}`, borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}
            >
              {f.label} {countFor(f.key)}
            </button>
          )
        })}
      </div>
      {(selected.size > 0 || proc) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, background: 'var(--app-card-2)' }}>
          {proc ? (
            <>
              <span style={{ fontSize: 11, color: 'var(--app-text-2)' }}>
                Processing {proc.done}/{proc.total}… <span style={{ color: MUTED }}>{proc.drafted} personalized · {proc.skipped} template</span>
              </span>
              <div style={{ flex: 1, maxWidth: 220, height: 6, background: 'var(--app-input)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${proc.total ? Math.round((proc.done / proc.total) * 100) : 0}%`, background: ACCENT, transition: 'width 0.3s' }} />
              </div>
              <button onClick={() => { cancelProc.current = true }} style={btnGhost()}>Cancel</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 11, color: MUTED }}>{selected.size} selected</span>
              {selectedNew.length > 0 && (
                <button disabled={busy} onClick={process} style={btn(ACCENT)} title="Enrich the selected new contacts now and move them into To review. Bypasses the drip buffer cap.">
                  Process ({selectedNew.length})
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => (confirmBulk ? del([...selected]) : setConfirmBulk(true))}
                style={confirmBulk ? btn('#b04545') : btnGhost('#b04545')}
              >
                {confirmBulk ? `Confirm delete (${selected.size})` : `Delete (${selected.size})`}
              </button>
              {confirmBulk && <button disabled={busy} onClick={() => setConfirmBulk(false)} style={btnGhost()}>Cancel</button>}
              {procError && <span style={{ fontSize: 11, color: '#b04545' }}>{procError}</span>}
            </>
          )}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--app-card-2)' }}>
              <th style={{ ...th, width: 32, cursor: 'default' }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              </th>
              <th style={th} onClick={() => toggleSort('email')}>Email{caret('email')}</th>
              <th style={th} onClick={() => toggleSort('name')}>Name{caret('name')}</th>
              <th style={th} onClick={() => toggleSort('domain')}>Website{caret('domain')}</th>
              <th style={th} onClick={() => toggleSort('status')}>Status{caret('status')}</th>
              <th style={th} onClick={() => toggleSort('added')}>Added{caret('added')}</th>
              <th style={{ ...th, cursor: 'default', textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, color: MUTED, textAlign: 'center', padding: 20 }}>No contacts in this view.</td></tr>
            )}
            {visible.map((p) => {
              const stage = contactStage(p)
              return (
              <tr key={p.id} style={{ background: selected.has(p.id) ? CARD : 'transparent' }}>
                <td style={{ ...td, width: 32 }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)' }}>{p.email}</td>
                <td style={td}>{p.recipient_name ?? <span style={{ color: MUTED }}>—</span>}</td>
                <td style={td}>
                  {p.domain
                    ? isFreeProvider(p.domain)
                      ? <span style={{ color: MUTED }}>{p.domain}</span>
                      : <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>{p.domain} ↗</a>
                    : <span style={{ color: MUTED }}>—</span>}
                </td>
                <td style={td}><Pill label={stage.label} color={stage.color} /></td>
                <td style={{ ...td, color: MUTED, whiteSpace: 'nowrap' }}>{fmtWhen(p.created_at)}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {confirmId === p.id ? (
                    <>
                      <button disabled={busy} onClick={() => del([p.id])} style={btn('#b04545')}>Confirm</button>
                      <button disabled={busy} onClick={() => setConfirmId(null)} style={{ ...btnGhost(), marginLeft: 6 }}>Cancel</button>
                    </>
                  ) : (
                    <button disabled={busy} onClick={() => setConfirmId(p.id)} style={btnGhost('#b04545')}>Delete</button>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
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
  const risks = replyRiskWarnings(draft.subject, draft.body)

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, background: CARD, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--app-text-2)' }}>{touchLabel(draft.step)}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {draft.is_template ? <Pill label="template" color={MUTED} /> : <Pill label="personalized" color="#1D9E75" />}
          {!draft.clean && <Pill label="drift" color="#b04545" />}
          {warnings.length > 0 && <Pill label="hygiene" color="#e0a060" />}
          {risks.length > 0 && <Pill label="reply risk" color="#e0a060" />}
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

      {risks.length > 0 && (
        <div style={{ fontSize: 11, color: '#e0a060' }}>Reply risk: {risks.join(' · ')}</div>
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
          {draft.send.status === 'failed' && (
            <button disabled={busy} onClick={() => act(() => queueDraftSend(companyId, draft.id))} style={btnGhost(ACCENT)}>Retry</button>
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
            {(draft.status === 'approved' || draft.status === 'edited') && (!draft.send || draft.send.status === 'failed' || draft.send.status === 'canceled') && (
              <button disabled={busy} onClick={() => act(() => queueDraftSend(companyId, draft.id))} style={btn(ACCENT)}>Queue to send</button>
            )}
            {(draft.status === 'approved' || draft.status === 'edited') && (
              <button disabled={busy} onClick={() => act(() => markExported(companyId, [draft.id]))} style={btnGhost('#378ADD')}>Mark as sent</button>
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
  const [confirmDelete, setConfirmDelete] = useState(false)

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
          <button
            disabled={busy}
            onClick={() => (confirmDelete ? act(() => deleteProspects(companyId, [prospect.id])) : setConfirmDelete(true))}
            style={confirmDelete ? btn('#b04545') : btnGhost('#b04545')}
          >
            {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
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

      {/* Opt-out callout — a reply asking to stop. Loud and unmissable: sending
          is already suppressed (disposition = unsubscribed), the human just needs
          to know. Shows even if the preview text wasn't captured. */}
      {prospect.disposition === 'unsubscribed' && (
        <div style={{ border: '1px solid #b04545', borderRadius: 8, padding: 10, background: 'rgba(176,69,69,0.10)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#b04545' }}>✋ Opt-out request — do not email this address</div>
          <div style={{ fontSize: 11, color: 'var(--app-text-2)', marginTop: 4 }}>
            This reply asked to stop. Sending is suppressed for {prospect.email}. Reopen only if this was a false match.
          </div>
        </div>
      )}

      {/* Inbound reply/bounce preview (snippet only — full thread lives in Gmail). */}
      {(prospect.reply_snippet || prospect.reply_from) && (
        <div style={{ border: `1px solid ${BORDER}`, borderLeft: `3px solid ${prospect.disposition === 'bounced' || prospect.disposition === 'unsubscribed' ? '#b04545' : '#378ADD'}`, borderRadius: 8, padding: 10, background: 'var(--app-card-2)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            {prospect.disposition === 'bounced' ? 'Bounce notice' : prospect.disposition === 'unsubscribed' ? 'Opt-out message' : 'Reply received'}
            {prospect.disposition_at && ` · ${fmtWhen(prospect.disposition_at)}`}
          </div>
          {prospect.reply_from && <div style={{ fontSize: 12, color: 'var(--app-text)' }}><span style={{ color: MUTED }}>From:</span> {prospect.reply_from}</div>}
          {prospect.reply_subject && <div style={{ fontSize: 12, color: 'var(--app-text)', marginTop: 2 }}><span style={{ color: MUTED }}>Subject:</span> {prospect.reply_subject}</div>}
          {prospect.reply_snippet && <div style={{ fontSize: 12, color: 'var(--app-text-2)', marginTop: 6, lineHeight: 1.5 }}>{prospect.reply_snippet}…</div>}
          <div style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>Preview only — open the thread in Gmail to read and reply in full.</div>
        </div>
      )}

      {initial?.is_template && prospect.skip_reason && (
        <div style={{ fontSize: 11, color: MUTED, fontStyle: 'italic' }}>
          Generic template (couldn’t personalize, {prospect.skip_stage}): {prospect.skip_reason}
        </div>
      )}

      {/* Keyed off the raw skip fields (not needs_review, which clears once a
          draft is approved/sent) so an uncertain match stays fixable later. */}
      {prospect.skip_stage === 'enrich' && (prospect.skip_reason ?? '').startsWith('low_confidence') && (
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

/** Action feedback. Info toasts auto-dismiss; errors stay until dismissed. */
type Toast = { id: number; text: string; kind: 'info' | 'error' }

export function OutreachWorkspace() {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [snapshot, setSnapshot] = useState<OutreachSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(0)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ processed: number; total: number; drafted: number; skipped: number; cost: number } | null>(null)
  const [filter, setFilter] = useState<Filter>('review')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sendingModalOpen, setSendingModalOpen] = useState(false)
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set())
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduledSends, setScheduledSends] = useState<ScheduledSendView[]>([])
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [listSortKey, setListSortKey] = useState<ListSortKey>('type')
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('asc')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleListSort = (k: ListSortKey) => {
    if (k === listSortKey) setListSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setListSortKey(k); setListSortDir('asc') }
  }

  const refresh = useCallback(async () => {
    if (!companyId) return
    const snap = await getOutreachSnapshot(companyId)
    setSnapshot(snap)
  }, [companyId])

  const loadScheduled = useCallback(async () => {
    if (!companyId) return
    setScheduledSends(await getScheduledSends(companyId))
  }, [companyId])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    (text: string, kind: Toast['kind'] = 'info') => {
      const id = ++toastSeq.current
      setToasts((prev) => [...prev, { id, text, kind }])
      if (kind !== 'error') setTimeout(() => dismissToast(id), 4000)
    },
    [dismissToast],
  )

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

  // The Vercel cron mutates send/reply state every ~5 minutes; poll while the
  // tab is visible (and refetch as soon as it becomes visible again) so counts
  // and statuses stay current without a manual reload.
  useEffect(() => {
    if (!companyId) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      refresh()
      if (filter === 'scheduled') loadScheduled()
    }
    const interval = setInterval(tick, 150_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [companyId, filter, refresh, loadScheduled])

  useEffect(() => {
    if (filter === 'scheduled') loadScheduled()
  }, [filter, loadScheduled])

  // Shared ingest core: takes any text blob (pasted or read from a file),
  // hands it to the server action (which regex-extracts emails regardless of
  // separators/columns), then reports the result.
  const ingest = useCallback(
    async (text: string, onSuccess?: () => void) => {
      if (!companyId || !text.trim()) return
      const r = await ingestProspects(companyId, text)
      if (!r.ok) return pushToast(r.error, 'error')
      onSuccess?.()
      pushToast(
        `Added ${r.data.added}. ${r.data.duplicates} duplicate(s), ${r.data.invalid} invalid` +
          (r.data.undeliverable > 0 ? `, ${r.data.undeliverable} undeliverable (no mail server)` : '') +
          '.',
      )
      refresh()
    },
    [companyId, refresh, pushToast],
  )

  const handleIngest = useCallback(() => ingest(raw, () => setRaw('')), [ingest, raw])

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = '' // reset so the same file can be re-selected
      if (!file) return
      const text = await file.text()
      await ingest(text)
    },
    [ingest],
  )

  // Chunked run: processes the queue 5 at a time, updating the progress panel
  // and the live list after each chunk, until the queue drains. This both shows
  // progress and lets lists larger than the per-call cap finish in one click.
  // Wave-based: enrich one buffer's worth (~3 days of send capacity) per click so
  // time-sensitive facts stay fresh. The cron tops up automatically too; click
  // again (or wait) to enrich the next wave.
  const handleRun = useCallback(async () => {
    if (!companyId) return
    setRunning(true)
    const r = await enrichWaveNow(companyId)
    setRunning(false)
    if (!r.ok) return pushToast(r.error, 'error')
    const { enriched, drafted, skipped, remaining, cost_usd, note } = r.data
    pushToast(
      enriched === 0
        ? `Nothing enriched${note ? ` — ${note}` : ''}.`
        : `Enriched ${enriched} (${drafted} personalized, ${skipped} template). ${remaining} left for later waves. ${fmtUsd(cost_usd)} this run.`,
    )
    refresh()
  }, [companyId, refresh, pushToast])

  const handleMarkExported = useCallback(
    async (ids: string[]) => {
      if (!companyId || ids.length === 0) return
      const r = await markExported(companyId, ids)
      if (!r.ok) return pushToast(r.error, 'error')
      pushToast(`Moved ${r.data.count} draft(s) to Exported.`)
      refresh()
    },
    [companyId, refresh, pushToast],
  )

  const handleApproveAll = useCallback(
    async (ids: string[]) => {
      if (!companyId || ids.length === 0) return
      const r = await approveDrafts(companyId, ids)
      if (!r.ok) return pushToast(r.error, 'error')
      pushToast(`Approved ${r.data.count} draft(s).`)
      refresh()
    },
    [companyId, refresh, pushToast],
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
    contacts: prospects,
    review: withDraft.filter((p) => !p.draft!.is_template && p.draft!.status === 'pending'),
    templates: withDraft.filter((p) => p.draft!.is_template && p.draft!.status === 'pending' && !p.needs_review),
    needs_review: prospects.filter((p) => p.needs_review),
    approved: withDraft.filter((p) => p.draft!.status === 'approved' || p.draft!.status === 'edited'),
    exported: withDraft.filter((p) => p.draft!.status === 'exported'),
    replied: prospects.filter((p) => p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested'),
    bounced: prospects.filter((p) => p.disposition === 'bounced' || p.disposition === 'unsubscribed'),
    scheduled: [], // the Scheduled tab renders ScheduledView from scheduledSends, not this list
    all: withDraft,
  }
  const current = lists[filter]
  const selected = current.find((p) => p.id === selectedId) ?? current[0] ?? null

  const handleProcessQueue = async () => {
    if (!companyId) return
    setProcessing(true)
    const r = await processSendQueue(companyId)
    setProcessing(false)
    if (!r.ok) return pushToast(r.error, 'error')
    pushToast(
      `Sent ${r.data.sent}${r.data.failed ? `, ${r.data.failed} failed` : ''}.` +
        (r.data.recovered ? ` Recovered ${r.data.recovered} send${r.data.recovered === 1 ? '' : 's'} stuck from an interrupted run — marked failed, verify in Gmail Sent before re-queuing.` : ''),
      r.data.failed || r.data.recovered ? 'error' : 'info',
    )
    refresh()
  }

  const handleScanReplies = async () => {
    if (!companyId) return
    setScanning(true)
    const r = await scanRepliesNow(companyId)
    setScanning(false)
    if (!r.ok) return pushToast(r.error, 'error')
    const { replied, bounced, unsubscribed, skipped } = r.data
    if (replied === 0 && bounced === 0 && unsubscribed === 0) {
      pushToast(`No new replies or bounces${skipped ? ` (${skipped})` : ''}.`)
    } else {
      const optPart = unsubscribed > 0 ? `, ${unsubscribed} opt-out${unsubscribed === 1 ? '' : 's'}` : ''
      pushToast(
        `Found ${replied} repl${replied === 1 ? 'y' : 'ies'}, ${bounced} bounce${bounced === 1 ? '' : 's'}${optPart}.` +
          (unsubscribed > 0 ? ' Opt-outs were flagged and suppressed from sending.' : ''),
        unsubscribed > 0 ? 'error' : 'info',
      )
    }
    refresh()
  }

  const toggleDraft = (id: string) => {
    setConfirmBulkDelete(false)
    setSelectedDraftIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (!companyId || selectedDraftIds.size === 0) return
    const prospectIds = current.filter((p) => p.draft && selectedDraftIds.has(p.draft.id)).map((p) => p.id)
    if (prospectIds.length === 0) return
    const r = await deleteProspects(companyId, prospectIds)
    if (!r.ok) return pushToast(r.error, 'error')
    pushToast(`Deleted ${r.data.deleted} prospect(s).`)
    setSelectedDraftIds(new Set())
    setConfirmBulkDelete(false)
    setSelectedId(null)
    refresh()
  }

  const handleSchedule = async (startIso: string) => {
    if (!companyId || selectedDraftIds.size === 0) return
    setScheduling(true)
    const r = await scheduleDraftSends(companyId, [...selectedDraftIds], startIso)
    setScheduling(false)
    if (!r.ok) return pushToast(r.error, 'error')
    pushToast(`Scheduled ${r.data.scheduled}${r.data.skipped ? `, ${r.data.skipped} skipped (closed or already queued)` : ''}.`)
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
    <div className="outreach-ws" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      {/* Inline styles can't express media queries, so the responsive bits live
          here: the two-pane grid stacks below 700px and touch targets grow. */}
      <style>{`
        .outreach-split { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); }
        @media (max-width: 700px) {
          /* The app shell hands the workspace a fixed height, but on a phone the
             wrapped header/metrics/tabs eat nearly all of it. main scrolls, so
             release the height (!important beats the inline style; flex-shrink 0
             stops the page wrapper squeezing it back) and let the page grow: the
             list caps at 38vh and scrolls, the detail pane runs at natural height. */
          .outreach-ws { height: auto !important; flex-shrink: 0; }
          .outreach-split { grid-template-columns: minmax(0, 1fr); }
          .outreach-split > :first-child { max-height: 38vh; }
          .outreach-ws button { min-height: 40px; }
          .outreach-ws input:not([type="checkbox"]):not([type="file"]) { min-height: 40px; }
        }
      `}</style>

      {/* Pipeline-stopping states. Each of these silently halts sends/scans, so
          they go first — above everything else, impossible to miss. */}
      {snapshot?.sending?.gmail && snapshot.sending.gmail.status !== 'connected' && (
        <Banner color="#b04545">
          ⚠ Gmail connection {snapshot.sending.gmail.status === 'not_connected' ? 'missing' : `in ${snapshot.sending.gmail.status} state`} — sending and reply detection are stopped
          {snapshot.sending.gmail.last_error ? `: ${snapshot.sending.gmail.last_error}` : ''}. Reconnect Gmail in Settings → Connections.
        </Banner>
      )}
      {snapshot?.sending?.pause_reason === 'bounce_rate' && !snapshot.sending.active && (
        <Banner color="#e0a060">
          ⚠ Sending auto-paused — bounce rate hit {Math.round((snapshot.sending.bounce_rate_7d ?? 0) * 100)}% over the last 7 days. Clean the list, then re-enable in <button onClick={() => setSendingModalOpen(true)} style={{ ...btnGhost('#e0a060'), padding: '2px 8px' }}>Sending</button>.
        </Banner>
      )}
      {snapshot?.sending?.pause_reason === 'manual' && !snapshot.sending.active && (c?.queued ?? 0) > 0 && (
        <Banner color="#e0a060">
          ⚠ Sending is off — {c!.queued} queued email{c!.queued === 1 ? '' : 's'} will not go out until you re-enable it in <button onClick={() => setSendingModalOpen(true)} style={{ ...btnGhost('#e0a060'), padding: '2px 8px' }}>Sending</button>.
        </Banner>
      )}

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
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button onClick={() => fileInputRef.current?.click()} style={btnGhost()} title="Upload a CSV or TXT file of email addresses">Upload file</button>
        <button onClick={() => setSendingModalOpen(true)} style={btnGhost()}>Sending</button>
        <button onClick={() => setTemplatesModalOpen(true)} style={btnGhost()} title="Manage the fallback templates rotated for prospects that can't be personalized, and see their performance">Manage templates</button>
        <button onClick={handleScanReplies} disabled={scanning} style={btnGhost()} title="Check Gmail for replies and bounces, then update outcomes">
          {scanning ? 'Scanning…' : 'Scan replies'}
        </button>
        <button onClick={handleProcessQueue} disabled={processing || (c?.queued ?? 0) === 0} style={btnGhost(ACCENT)}>
          {processing ? 'Processing…' : `Process queue${c?.queued ? ` (${c.queued})` : ''}`}
        </button>
        <button onClick={handleRun} disabled={running || (c?.new ?? 0) === 0} style={btnGhost(ACCENT)} title="Enrich one wave (~3 days of send capacity). Keeps federal-award facts fresh instead of draining the whole list at once.">
          {running ? 'Enriching…' : `Enrich wave${c?.new ? ` (${c.new})` : ''}`}
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
          {/* Denominator is tracked sends, not all sends: emails sent before
              open tracking existed carry no pixel and would drag this to zero. */}
          <Metric
            label="Open rate"
            value={fmtPct(snapshot?.opens.rate ?? 0, snapshot?.opens.tracked ?? 0)}
            hint={snapshot?.opens.tracked ? `${snapshot.opens.opened} of ${snapshot.opens.tracked} tracked` : 'no tracked sends yet'}
          />
          <Metric label="API cost" value={fmtUsd(snapshot?.cost_usd_total ?? 0)} />
        </div>
      )}
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
              {tab('contacts', 'Contacts', lists.contacts.length)}
              {tab('review', 'To review', lists.review.length)}
              {tab('templates', 'Templates', lists.templates.length)}
              {tab('needs_review', 'Needs review', lists.needs_review.length)}
              {tab('approved', 'Ready to email', lists.approved.length)}
              {tab('exported', 'Sent', lists.exported.length)}
              {tab('replied', 'Replied', lists.replied.length)}
              {tab('bounced', 'Bounced / opt-out', lists.bounced.length)}
              {tab('scheduled', 'Scheduled', c?.queued ?? 0)}
              {tab('all', 'All', lists.all.length)}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, paddingBottom: 4, alignItems: 'center' }}>
              {filter === 'templates' && (
                <button onClick={() => setTemplatesModalOpen(true)} style={btn(ACCENT)} title="Create, edit, activate, and track your fallback templates">
                  Manage templates
                </button>
              )}
              {(filter === 'review' || filter === 'templates') && current.length > 0 && (
                <button onClick={() => handleApproveAll(current.map((p) => p.draft!.id))} style={btn('#1D9E75')}>
                  Approve all ({current.length})
                </button>
              )}
              {filter === 'approved' && current.length > 0 && (
                <button
                  onClick={() => { setConfirmBulkDelete(false); setSelectedDraftIds((prev) => prev.size === current.length ? new Set() : new Set(current.map((p) => p.draft!.id))) }}
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
              {filter === 'approved' && selectedDraftIds.size > 0 && (
                <button onClick={() => { handleMarkExported([...selectedDraftIds]); setSelectedDraftIds(new Set()) }} style={btnGhost('#378ADD')}>
                  Mark as sent
                </button>
              )}
              {filter === 'approved' && selectedDraftIds.size > 0 && (
                <button
                  onClick={() => (confirmBulkDelete ? handleBulkDelete() : setConfirmBulkDelete(true))}
                  style={confirmBulkDelete ? btn('#b04545') : btnGhost('#b04545')}
                >
                  {confirmBulkDelete ? 'Confirm delete' : `Delete (${selectedDraftIds.size})`}
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
          ) : filter === 'contacts' ? (
            <ContactsTable prospects={current} companyId={companyId} onChanged={refresh} />
          ) : (
          <div className="outreach-split" style={{ flex: 1, minHeight: 0, gap: 14 }}>
            {/* List */}
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
              {current.length === 0 && <div style={{ fontSize: 12, color: MUTED, padding: 14 }}>{EMPTY_MSG[filter]}</div>}
              {current.length > 0 && (filter === 'approved' || filter === 'exported' || filter === 'all') ? (
                // Sortable list. Default ('type' asc) keeps the classic grouped
                // view — Personalized then Templates, each by name; the other
                // keys flatten the list and sort it.
                (() => {
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
                  const sortBtn = (k: ListSortKey, label: string) => (
                    <button
                      key={k}
                      onClick={() => toggleListSort(k)}
                      style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: listSortKey === k ? ACCENT : MUTED, background: 'transparent', border: 'none', padding: '2px 5px', cursor: 'pointer', minHeight: 'auto' }}
                    >
                      {label}{listSortKey === k ? (listSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  )
                  const sortBar = (
                    <div style={{ display: 'flex', gap: 2, alignItems: 'center', padding: '3px 8px', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 2 }}>Sort</span>
                      {sortBtn('type', 'Type')}
                      {sortBtn('name', 'Name')}
                      {sortBtn('email', 'Email')}
                      {sortBtn('status', 'Status')}
                    </div>
                  )
                  if (listSortKey === 'type') {
                    const personalized = current.filter((p) => p.draft && !p.draft.is_template).sort(byName)
                    const templates = current.filter((p) => p.draft && p.draft.is_template).sort(byName)
                    const sections: [string, OutreachProspectView[]][] = listSortDir === 'asc'
                      ? [['Personalized', personalized], ['Templates', templates]]
                      : [['Templates', templates], ['Personalized', personalized]]
                    return (
                      <>
                        {sortBar}
                        {sections.map(([label, rows]) => (
                          rows.length > 0 && (
                            <div key={label}>
                              <SectionHeader label={label} count={rows.length} />
                              {rows.map(rowOf)}
                            </div>
                          )
                        ))}
                      </>
                    )
                  }
                  const dir = listSortDir === 'asc' ? 1 : -1
                  const cmp = (a: OutreachProspectView, b: OutreachProspectView): number => {
                    switch (listSortKey) {
                      case 'name': return byName(a, b)
                      case 'email': return a.email.localeCompare(b.email)
                      case 'status': return rowStage(a).localeCompare(rowStage(b)) || byName(a, b)
                      default: return 0
                    }
                  }
                  return (
                    <>
                      {sortBar}
                      {[...current].sort((a, b) => cmp(a, b) * dir).map(rowOf)}
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

      {templatesModalOpen && companyId && (
        <TemplatesModal companyId={companyId} prospects={prospects} onClose={() => setTemplatesModalOpen(false)} onChanged={refresh} />
      )}

      {scheduleDialogOpen && (
        <ScheduleDialog
          count={selectedDraftIds.size}
          busy={scheduling}
          onConfirm={handleSchedule}
          onClose={() => setScheduleDialogOpen(false)}
        />
      )}

      {/* Toast stack: bottom-right, above everything. Info auto-dismisses in 4s;
          errors keep their red border and stay until the × is tapped. */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 'min(360px, calc(100vw - 32px))' }}>
          {toasts.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.45, color: t.kind === 'error' ? '#d98a8a' : 'var(--app-text-2)', background: CARD, border: `1px solid ${t.kind === 'error' ? '#b04545' : BORDER}`, borderRadius: 8, padding: '10px 12px', boxShadow: '0 6px 20px rgba(0, 0, 0, 0.3)' }}>
              <span style={{ flex: 1 }}>{t.text}</span>
              <button
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss"
                style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px', minHeight: 'auto' }}
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
