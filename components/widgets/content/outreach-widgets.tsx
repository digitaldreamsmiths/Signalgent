'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useOutreach,
  FILTER_LABEL,
  SECTIONS,
  type Filter,
  type Section,
} from '@/contexts/outreach-context'
import { contactStage, isUnqueued } from '@/lib/integrations/outreach/stage'
import { PROSPECT_MAX_LOADED, STAGE_BUCKETS, type ProspectSort, type StageBucket } from '@/lib/integrations/outreach/views'
import {
  approveDraft,
  approveDrafts,
  deleteProspects,
  editDraft,
  generateFollowup,
  markExported,
  processProspects,
  rejectDraft,
  resolveManual,
  setContactName,
  setDisposition,
} from '@/lib/integrations/outreach/actions'
import { queueDraftSend, cancelSend, scheduleDraftSends } from '@/lib/integrations/outreach/sending'
import { assignProspectsToCampaign } from '@/lib/integrations/outreach/campaign-actions'
import type { OutreachCampaign } from '@/lib/integrations/outreach/campaigns'
import type { Disposition, OutreachDraftView, OutreachProspectView } from '@/lib/integrations/outreach/types'
import { hygieneWarnings, replyRiskWarnings } from '@/lib/integrations/outreach/hygiene'
import { ACCENT, BORDER, CARD, MUTED, Pill, btn, btnGhost } from './outreach-ui'
import { ReplyInbox, decodeEntities, gmailThreadUrl } from './reply-inbox'
import { ScheduledView } from './scheduled-view'
import { ScheduleDialog } from './schedule-dialog'


/** Sort keys the draft lists (Ready to email / Sent / All) offer. 'type' is the
 * default and keeps the grouped Personalized/Templates sections; the rest
 * flatten the list. Sorting runs server-side now — the browser only holds the
 * loaded page, so sorting it here would only reorder the first 100 rows. */
const LIST_SORTS: { key: ProspectSort; label: string }[] = [
  { key: 'type', label: 'Type' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Status' },
]

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


function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Contextual empty-state copy per filter tab. Each one says what the tab is
 * FOR and what fills it, so a new user learns the pipeline by walking the tabs
 * rather than guessing which of ten is broken. */
const EMPTY_MSG: Record<Filter, string> = {
  contacts: 'No contacts yet — paste or upload a list of email addresses above. Everything else follows from this.',
  review: 'Nothing waiting for review. Personalized drafts land here after enrichment, for you to approve before they can send.',
  templates: 'No template drafts waiting — templates are pre-approved copy, so they skip review and go straight to “Ready to email”.',
  needs_review: 'Nothing needs a manual match. Prospects appear here when the resolver finds a company but isn’t confident enough to use it.',
  approved: 'Nothing ready to email yet. Approve drafts from “To review”, and templates land here on their own.',
  exported: 'Nothing sent yet. Emails move here once they actually go out.',
  replied: 'No replies recorded yet. “Scan replies” checks your mailbox and files responses here automatically.',
  bounced: 'No bounces or unsubscribes. Anyone who lands here is suppressed from all future sending.',
  scheduled: 'Nothing scheduled yet. Approved drafts get a send time from the drip schedule and queue up here.',
  all: 'No drafts yet. Add contacts, then run an enrichment wave to generate the first emails.',
}

// ── List ──────────────────────────────────────────────────────────────────────

/** The footer under a paged list: how much of the view is on screen, and the
 * button that pulls the next page. Shown in every list so a count in a label
 * is never mistaken for the size of the whole view. */
function LoadMore({ loaded, total, busy, onMore }: { loaded: number; total: number; busy: boolean; onMore: () => void }) {
  if (total === 0) return null
  const more = loaded < total
  // Past the ceiling the answer is a narrower scope, not a bigger window: every
  // loaded row carries its drafts' full copy, and the poll re-reads the lot.
  const capped = more && loaded >= PROSPECT_MAX_LOADED
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', padding: '10px 12px', borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: MUTED }}>
        {more ? `${loaded.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}` : `All ${total.toLocaleString('en-US')}`}
        {capped && ' — pick a campaign or a status to narrow it down'}
      </span>
      {more && !capped && (
        <button disabled={busy} onClick={onMore} style={btnGhost(ACCENT)}>
          {busy ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
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

const BUCKET_LABEL: Record<StageBucket, string> = {
  new: 'New',
  review: 'In review',
  ready: 'Ready',
  emailed: 'Emailed',
  replied: 'Replied',
  other: 'Other',
}

const CONTACT_FILTERS: { key: ContactFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  ...STAGE_BUCKETS.map((k) => ({ key: k as ContactFilter, label: BUCKET_LABEL[k] })),
]

/** Master list of every ingested email — visible before enrichment, sortable by
 * any column, with per-row and bulk delete. This is the only place raw `new`
 * prospects (no draft yet) surface, since the workflow tabs all require a draft.
 *
 * `prospects` is one loaded page of the contact list, not the whole thing:
 * sorting, the status filter and the chip counts all come from the server, and
 * the bulk actions act on the rows actually loaded. */
function ContactsTable({ prospects, companyId, campaigns, onChanged }: { prospects: OutreachProspectView[]; companyId: string; campaigns: OutreachCampaign[]; onChanged: () => void }) {
  const {
    snapshot, sort: sortKey, dir: sortDir, toggleSort,
    stage, setStage, total, rowsLoading, loadMore,
  } = useOutreach()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [proc, setProc] = useState<{ done: number; total: number; drafted: number; skipped: number } | null>(null)
  const [procError, setProcError] = useState<string | null>(null)
  const cancelProc = useRef(false)

  // Only `new` prospects can be enriched; already-processed rows in the selection
  // are silently ignored so a "select all → Process" does the right thing.
  const statusById = new Map(prospects.map((p) => [p.id, p.status]))
  const selectedNew = [...selected].filter((id) => statusById.get(id) === 'new')

  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]))
  const campaignName = (p: OutreachProspectView) => (p.campaign_id ? campaignNameById.get(p.campaign_id) ?? '' : '')

  // Server-counted over the whole (campaign-scoped) contact list, so the chips
  // still say how many contacts are in each stage rather than how many are
  // loaded. Empty buckets stay hidden, except All/New.
  const countFor = (k: ContactFilter): number =>
    k === 'all' ? snapshot?.views.contacts ?? 0 : snapshot?.contact_buckets[k] ?? 0

  const visible = prospects
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
  const caret = (k: ProspectSort) => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', borderBottom: `1px solid ${BORDER}`, background: 'var(--app-card-2)' }}>
        {CONTACT_FILTERS.filter((f) => f.key === 'all' || f.key === 'new' || countFor(f.key) > 0).map((f) => {
          const on = stage === f.key
          return (
            <button
              key={f.key}
              onClick={() => { setSelected(new Set()); setStage(f.key) }}
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
              {campaigns.length > 0 && (
                <select
                  value=""
                  disabled={busy}
                  onChange={async (e) => {
                    const v = e.target.value
                    if (!v) return
                    setBusy(true)
                    const r = await assignProspectsToCampaign(companyId, [...selected], v === '__none' ? null : v)
                    setBusy(false)
                    if (!r.ok) return setProcError(r.error)
                    setProcError(null)
                    setSelected(new Set())
                    onChanged()
                  }}
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--app-text-2)', background: 'var(--app-input)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}
                  title="Move the selected contacts into a campaign"
                >
                  <option value="" disabled>Move to campaign…</option>
                  {campaigns.filter((cm) => cm.status === 'active').map((cm) => (
                    <option key={cm.id} value={cm.id}>{cm.name}</option>
                  ))}
                  <option value="__none">No campaign</option>
                </select>
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
              {campaigns.length > 0 && <th style={th} onClick={() => toggleSort('campaign')}>Campaign{caret('campaign')}</th>}
              <th style={th} onClick={() => toggleSort('added')}>Added{caret('added')}</th>
              <th style={{ ...th, cursor: 'default', textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={campaigns.length > 0 ? 8 : 7} style={{ ...td, color: MUTED, textAlign: 'center', padding: 20 }}>
                {rowsLoading ? 'Loading…' : 'No contacts in this view.'}
              </td></tr>
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
                {campaigns.length > 0 && (
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {campaignName(p) || <span style={{ color: MUTED }}>—</span>}
                  </td>
                )}
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
        <LoadMore loaded={visible.length} total={total} busy={rowsLoading} onMore={loadMore} />
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

function DraftDetail({ prospect, companyId, senderEmail, onChanged }: { prospect: OutreachProspectView; companyId: string; senderEmail: string | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualName, setManualName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Contact-name editor. The input holds only the MANUAL override; a derived
  // (parsed-from-email) name shows as the placeholder so clearing the field
  // falls back to the parse rather than deleting knowledge.
  const [contactInput, setContactInput] = useState(prospect.contact_name_manual ? prospect.contact_name ?? '' : '')
  const contactDirty = contactInput.trim() !== (prospect.contact_name_manual ? (prospect.contact_name ?? '').trim() : '')
  const parsedContact = !prospect.contact_name_manual ? prospect.contact_name : null

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
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: MUTED }}>Contact:</span>
            <input
              value={contactInput}
              onChange={(e) => setContactInput(e.target.value)}
              placeholder={parsedContact ? `${parsedContact} (from email)` : 'no name — greets “Hi,”'}
              title="Person name used in the greeting of NEW drafts. Blank = derive from the email address."
              style={{ fontSize: 11, background: 'var(--app-input)', border: `1px solid ${BORDER}`, borderRadius: 5, color: 'var(--app-text)', padding: '3px 7px', width: 190, minHeight: 'auto' }}
            />
            {contactDirty && (
              <button disabled={busy} onClick={() => act(() => setContactName(companyId, prospect.id, contactInput))} style={{ ...btnGhost(), padding: '3px 10px' }}>
                Save
              </button>
            )}
            {prospect.contact_name && (
              <span style={{ fontSize: 10, color: MUTED }}>new drafts greet “Hi {prospect.contact_name.split(' ')[0]},”</span>
            )}
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
          {/* Gmail hands us HTML-escaped text; decode for display (see decodeEntities). */}
          {prospect.reply_from && <div style={{ fontSize: 12, color: 'var(--app-text)' }}><span style={{ color: MUTED }}>From:</span> {decodeEntities(prospect.reply_from)}</div>}
          {prospect.reply_subject && <div style={{ fontSize: 12, color: 'var(--app-text)', marginTop: 2 }}><span style={{ color: MUTED }}>Subject:</span> {decodeEntities(prospect.reply_subject)}</div>}
          {prospect.reply_snippet && <div style={{ fontSize: 12, color: 'var(--app-text-2)', marginTop: 6, lineHeight: 1.5 }}>{decodeEntities(prospect.reply_snippet)}…</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: MUTED }}>Preview only — open the thread in Gmail to read and reply in full.</span>
            {prospect.thread_id && (
              <a
                href={gmailThreadUrl(prospect.thread_id, senderEmail)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...btnGhost(ACCENT), padding: '3px 10px', textDecoration: 'none' }}
              >
                Open in Gmail ↗
              </a>
            )}
          </div>
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

/**
 * The workspace body for one section. The section itself is the route (Phase 5
 * stage 2b) — the rail lives in the layout, so this renders the shared chrome
 * plus whichever views the given section contains.
 */
export function OutreachWorkspace({ section }: { section: Section }) {
  // The chrome (header, metrics, banners, modals, toasts) lives in the layout
  // now; this component renders only the section's own views.
  //
  // The active view, its sort and its loaded rows come from the provider: they
  // decide what the server fetches, so they can't be local state any more.
  const {
    companyId, snapshot, refresh, campaigns, scheduledSends, loadScheduled, pushToast,
    view: filter, setView: setFilter,
    rows: current, total, rowsLoading, loadMore,
    sort: listSortKey, dir: listSortDir, toggleSort: toggleListSort,
  } = useOutreach()

  // View-local state.
  const sectionFilters = SECTIONS.find((sec) => sec.key === section)!.filters
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set())
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  useEffect(() => {
    if (filter === 'scheduled') loadScheduled()
  }, [filter, loadScheduled])

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

  // allProspects / prospects / lists / campaigns / campaignStats now come from
  // the provider — the campaign scope is applied there, so every view (and
  // every future route) sees the same filtered set.
  const selected = current.find((p) => p.id === selectedId) ?? current[0] ?? null
  // Bulk actions act on the rows that are actually loaded, so a label has to say
  // so whenever the view runs past the loaded window — "Approve all (100)" on a
  // 1,200-draft queue would be a lie. Load more first to widen the reach.
  const partial = current.length < total
  const scopeNote = partial ? ` of ${total.toLocaleString('en-US')} — load more to include the rest` : ''

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

  // Sub-tab counts — server-side, campaign-scoped, over the WHOLE view. The
  // browser holds one page, so these can't be row lengths any more.
  const countFor = (f: Filter): number => snapshot?.views[f] ?? 0

  return (
    <>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${BORDER}` }}>
            {/* Sub-tabs, only where a section has more than one view. */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {sectionFilters.length > 1 && sectionFilters.map((f) => tab(f, FILTER_LABEL[f], countFor(f)))}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, paddingBottom: 4, alignItems: 'center' }}>
              {(filter === 'review' || filter === 'templates') && current.length > 0 && (
                <button
                  onClick={() => handleApproveAll(current.map((p) => p.draft!.id))}
                  style={btn('#1D9E75')}
                  title={`Approve the ${current.length} draft(s) loaded${scopeNote}`}
                >
                  {partial ? 'Approve loaded' : 'Approve all'} ({current.length})
                </button>
              )}
              {filter === 'approved' && current.length > 0 && (
                <button
                  onClick={() => { setConfirmBulkDelete(false); setSelectedDraftIds((prev) => prev.size === current.length ? new Set() : new Set(current.map((p) => p.draft!.id))) }}
                  style={btnGhost()}
                  title={`Select the ${current.length} draft(s) loaded${scopeNote}`}
                >
                  {selectedDraftIds.size === current.length ? 'Clear' : partial ? `Select loaded (${current.length})` : 'Select all'}
                </button>
              )}
              {filter === 'approved' && (() => {
                // "Unqueued" mirrors what scheduleDraftSends would actually take:
                // no send yet, or only a failed/canceled attempt.
                const unqueued = current.filter((p) => isUnqueued(p.draft))
                return unqueued.length > 0 ? (
                  <button
                    onClick={() => { setConfirmBulkDelete(false); setSelectedDraftIds(new Set(unqueued.map((p) => p.draft!.id))) }}
                    style={btnGhost()}
                    title={`Select only the loaded drafts that aren't already queued or sent${scopeNote}`}
                  >
                    Select unqueued ({unqueued.length})
                  </button>
                ) : null
              })()}
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
                <button
                  onClick={() => handleExport(current, filter)}
                  style={btnGhost(ACCENT)}
                  title={`Export the ${current.length} row(s) loaded${scopeNote}`}
                >
                  Export CSV ({current.length}{partial ? ` of ${total.toLocaleString('en-US')}` : ''})
                </button>
              )}
            </div>
          </div>

          {filter === 'scheduled' ? (
            companyId && (
              <ScheduledView companyId={companyId} sends={scheduledSends} onChanged={() => { loadScheduled(); refresh() }} />
            )
          ) : filter === 'contacts' ? (
            <ContactsTable prospects={current} companyId={companyId} campaigns={campaigns} onChanged={refresh} />
          ) : filter === 'replied' ? (
            <>
              <ReplyInbox
                prospects={current}
                companyId={companyId}
                senderEmail={snapshot?.sending?.sender_email ?? null}
                onChanged={refresh}
              />
              <LoadMore loaded={current.length} total={total} busy={rowsLoading} onMore={loadMore} />
            </>
          ) : (
          <div className="outreach-split" style={{ flex: 1, minHeight: 0, gap: 14 }}>
            {/* List */}
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
              {current.length === 0 && (
                <div style={{ fontSize: 12, color: MUTED, padding: 14 }}>{rowsLoading ? 'Loading…' : EMPTY_MSG[filter]}</div>
              )}
              {current.length > 0 && (filter === 'approved' || filter === 'exported' || filter === 'all') ? (
                // Sortable list. Default ('type' asc) keeps the classic grouped
                // view — Personalized then Templates, each by name; the other
                // keys flatten the list. The server does the ordering, so the
                // rows arrive already grouped and this only draws the dividers.
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
                  const sortBar = (
                    <div style={{ display: 'flex', gap: 2, alignItems: 'center', padding: '3px 8px', borderBottom: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 2 }}>Sort</span>
                      {LIST_SORTS.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => toggleListSort(key)}
                          style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: listSortKey === key ? ACCENT : MUTED, background: 'transparent', border: 'none', padding: '2px 5px', cursor: 'pointer', minHeight: 'auto' }}
                        >
                          {label}{listSortKey === key ? (listSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </button>
                      ))}
                    </div>
                  )
                  if (listSortKey === 'type') {
                    // Counts are of the LOADED rows, matching what the dividers
                    // actually separate; the view's real totals are in the tabs.
                    const personalized = current.filter((p) => p.draft && !p.draft.is_template)
                    const templates = current.filter((p) => p.draft && p.draft.is_template)
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
                  return (
                    <>
                      {sortBar}
                      {current.map(rowOf)}
                    </>
                  )
                })()
              ) : (
                current.map((p) => (
                  <ProspectRow key={p.id} p={p} selected={selected?.id === p.id} onSelect={() => setSelectedId(p.id)} />
                ))
              )}
              <LoadMore loaded={current.length} total={total} busy={rowsLoading} onMore={loadMore} />
            </div>

            {/* Detail */}
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflowY: 'auto', minHeight: 0, padding: 16 }}>
              {selected ? (
                <DraftDetail key={selected.id} prospect={selected} companyId={companyId} senderEmail={snapshot?.sending?.sender_email ?? null} onChanged={refresh} />
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

      {scheduleDialogOpen && (
        <ScheduleDialog
          count={selectedDraftIds.size}
          busy={scheduling}
          onConfirm={handleSchedule}
          onClose={() => setScheduleDialogOpen(false)}
        />
      )}
    </>
  )
}
