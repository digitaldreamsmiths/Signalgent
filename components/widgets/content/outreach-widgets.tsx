'use client'

import { useCallback, useEffect, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import {
  approveDraft,
  approveDrafts,
  editDraft,
  getOutreachSnapshot,
  ingestProspects,
  markExported,
  rejectDraft,
  resolveManual,
  runNewProspects,
} from '@/lib/integrations/outreach/actions'
import type { OutreachSnapshot, OutreachProspectView } from '@/lib/integrations/outreach/types'

const ACCENT = '#D85A30'
const BORDER = '#272727'
const CARD = '#1a1a1a'
const MUTED = '#8a8a8a'

type Filter = 'review' | 'templates' | 'needs_review' | 'approved' | 'exported' | 'all'

function btn(bg: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: '#fff', background: bg, border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}
function btnGhost(color = '#ccc'): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One row per prospect/draft — ready to import into a cold-email platform. */
function toCsv(rows: OutreachProspectView[]): string {
  const headers = [
    'email', 'company', 'domain', 'status', 'kind', 'subject', 'body',
    'location', 'business_types', 'award_count', 'sampled_total',
    'resolution_confidence', 'synthesis_confidence',
  ]
  const lines = [headers.join(',')]
  for (const p of rows) {
    const d = p.draft
    lines.push([
      p.email,
      p.recipient_name ?? '',
      p.domain ?? '',
      p.status,
      d ? (d.is_template ? 'template' : 'personalized') : '',
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
  return lines.join('\n')
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

// ── Detail pane ───────────────────────────────────────────────────────────────

function DraftDetail({ prospect, companyId, onChanged }: { prospect: OutreachProspectView; companyId: string; onChanged: () => void }) {
  const draft = prospect.draft
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(draft?.subject ?? '')
  const [body, setBody] = useState(draft?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualName, setManualName] = useState('')

  // Edit buffers initialize from the draft on mount; the parent remounts this
  // component per selection (key={draft.id}), so no reset effect is needed.

  const act = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
      setBusy(true)
      setError(null)
      const r = await fn()
      setBusy(false)
      if (!r.ok) setError(r.error ?? 'Something went wrong.')
      else {
        after?.()
        onChanged()
      }
    },
    [onChanged],
  )

  if (!draft) {
    return <div style={{ fontSize: 12, color: MUTED, padding: 16 }}>No draft for this prospect yet.</div>
  }

  const statusColor =
    draft.status === 'approved' ? '#1D9E75' : draft.status === 'rejected' ? '#b04545' : draft.status === 'edited' ? '#BA7517' : draft.status === 'exported' ? '#378ADD' : ACCENT

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#eee' }}>{prospect.recipient_name ?? prospect.domain}</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
            {prospect.email}
            {prospect.business_types.length > 0 && ` · ${prospect.business_types.includes('service_disabled_veteran_owned_business') ? 'SDVOSB' : prospect.business_types.includes('small_business') ? 'Small business' : prospect.business_types[0]}`}
            {prospect.location && ` · ${prospect.location}`}
            {prospect.footprint && ` · ${prospect.footprint.award_count} awards / $${Math.round(prospect.footprint.sampled_total).toLocaleString('en-US')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {draft.is_template ? <Pill label="template" color={MUTED} /> : <Pill label="personalized" color="#1D9E75" />}
          {!draft.clean && <Pill label="drift" color="#b04545" />}
          {prospect.resolution_confidence != null && <span style={{ fontSize: 10, color: MUTED }}>res {prospect.resolution_confidence.toFixed(2)}</span>}
          {draft.synthesis_confidence != null && <span style={{ fontSize: 10, color: MUTED }}>fit {draft.synthesis_confidence.toFixed(2)}</span>}
          <Pill label={draft.status} color={statusColor} />
        </div>
      </div>

      {draft.is_template && prospect.skip_reason && (
        <div style={{ fontSize: 11, color: MUTED, fontStyle: 'italic' }}>
          Generic template (couldn’t personalize, {prospect.skip_stage}): {prospect.skip_reason}
        </div>
      )}

      {prospect.needs_review && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, background: '#15110d' }}>
          <div style={{ fontSize: 11, color: '#e0a060', marginBottom: 6 }}>
            Uncertain match. Type the correct company name (as it appears in federal records) to re-resolve.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="e.g. Eagle Contractors Inc"
              style={{ flex: 1, background: '#111', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#eee', fontSize: 12, padding: '6px 8px' }}
            />
            <button
              disabled={busy || !manualName.trim()}
              onClick={() => act(() => resolveManual(companyId, prospect.id, manualName))}
              style={btn(ACCENT)}
            >
              Resolve
            </button>
          </div>
        </div>
      )}
      {!draft.clean && draft.drifted_facts.length > 0 && (
        <div style={{ fontSize: 11, color: '#d98a8a' }}>Used facts not in the approved set: {draft.drifted_facts.join('; ')}</div>
      )}

      {editing ? (
        <>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', background: '#111', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#eee', fontSize: 12, padding: '6px 8px' }} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} style={{ width: '100%', background: '#111', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#eee', fontSize: 12, padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </>
      ) : (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, background: CARD }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ccc', marginBottom: 6 }}>{draft.subject}</div>
          <div style={{ fontSize: 12, color: '#bbb', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{draft.body}</div>
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
                <div key={i} style={{ fontSize: 11, color: used ? '#bbb' : '#666' }}>
                  {used ? '✓ ' : '· '}
                  {f}
                </div>
              )
            })}
          </div>
        </details>
      )}

      {error && <div style={{ fontSize: 11, color: '#d98a8a' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        {editing ? (
          <>
            <button disabled={busy} onClick={() => act(() => editDraft(companyId, draft.id, subject, body), () => setEditing(false))} style={btn(ACCENT)}>
              Save
            </button>
            <button disabled={busy} onClick={() => { setSubject(draft.subject); setBody(draft.body); setEditing(false) }} style={btnGhost()}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button disabled={busy} onClick={() => act(() => approveDraft(companyId, draft.id))} style={btn('#1D9E75')}>
              Approve
            </button>
            <button disabled={busy} onClick={() => setEditing(true)} style={btnGhost()}>
              Edit
            </button>
            <button disabled={busy} onClick={() => act(() => rejectDraft(companyId, draft.id))} style={btnGhost('#b04545')}>
              Reject
            </button>
            {draft.status === 'approved' && (
              <button disabled={busy} onClick={() => act(() => markExported(companyId, [draft.id]))} style={btn('#378ADD')}>
                Mark exported
              </button>
            )}
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
                setError('Copied subject + body to clipboard.')
              }}
              style={btnGhost()}
            >
              Copy
            </button>
          </>
        )}
      </div>
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
  const [progress, setProgress] = useState<{ processed: number; total: number; drafted: number; skipped: number } | null>(null)
  const [filter, setFilter] = useState<Filter>('review')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!companyId) return
    const snap = await getOutreachSnapshot(companyId)
    setSnapshot(snap)
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

  const handleIngest = useCallback(async () => {
    if (!companyId || !raw.trim()) return
    setNotice(null)
    const r = await ingestProspects(companyId, raw)
    if (!r.ok) return setNotice(r.error)
    setRaw('')
    setNotice(`Added ${r.data.added}. ${r.data.duplicates} duplicate(s), ${r.data.invalid} invalid.`)
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
    setProgress({ processed: 0, total: 0, drafted: 0, skipped: 0 })
    for (let guard = 0; guard < 200; guard++) {
      const r = await runNewProspects(companyId, 5)
      if (!r.ok) {
        setNotice(r.error)
        break
      }
      processed += r.data.processed
      drafted += r.data.drafted
      skipped += r.data.skipped
      remaining = r.data.remaining
      setProgress({ processed, total: processed + remaining, drafted, skipped })
      await refresh()
      if (r.data.processed === 0 || remaining === 0) break
    }
    setRunning(false)
    setProgress(null)
    setNotice(`Done. ${drafted} personalized, ${skipped} template. ${remaining} remaining.`)
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
    all: withDraft,
  }
  const current = lists[filter]
  const selected = current.find((p) => p.id === selectedId) ?? current[0] ?? null

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Ingest + run */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Paste contact emails (any separator)…"
          style={{ flex: 1, minWidth: 260, background: '#111', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#eee', fontSize: 12, padding: '8px 10px' }}
        />
        <button onClick={handleIngest} disabled={!raw.trim()} style={btn(ACCENT)}>Add prospects</button>
        <button onClick={handleRun} disabled={running || (c?.new ?? 0) === 0} style={btnGhost(ACCENT)}>
          {running ? 'Running…' : `Run enrichment${c?.new ? ` (${c.new})` : ''}`}
        </button>
        {c && (
          <span style={{ fontSize: 11, color: MUTED, marginLeft: 'auto' }}>
            {c.total} total · {c.personalized} personalized · {c.templates} template · {c.needs_review} need review · {c.approved} approved · {c.exported} exported
          </span>
        )}
      </div>
      {notice && <div style={{ fontSize: 11, color: '#aaa' }}>{notice}</div>}

      {running && progress && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, background: CARD }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#ccc', marginBottom: 6 }}>
            <span>Enriching {progress.processed}{progress.total ? ` of ${progress.total}` : ''}…</span>
            <span style={{ color: MUTED }}>{progress.drafted} personalized · {progress.skipped} template</span>
          </div>
          <div style={{ height: 6, background: '#111', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress.total ? Math.round((progress.processed / progress.total) * 100) : 0}%`, background: ACCENT, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {loading && !snapshot && <div style={{ fontSize: 12, color: MUTED }}>Loading…</div>}
      {!loading && prospects.length === 0 && (
        <div style={{ fontSize: 12, color: MUTED }}>No prospects yet. Paste a contact list above to begin.</div>
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
              {tab('all', 'All', lists.all.length)}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, paddingBottom: 4 }}>
              {(filter === 'review' || filter === 'templates') && current.length > 0 && (
                <button onClick={() => handleApproveAll(current.map((p) => p.draft!.id))} style={btn('#1D9E75')}>
                  Approve all ({current.length})
                </button>
              )}
              {filter === 'approved' && current.length > 0 && (
                <button onClick={() => handleMarkExported(current.map((p) => p.draft!.id))} style={btn('#378ADD')}>
                  Mark all exported ({current.length})
                </button>
              )}
              {current.length > 0 && (
                <button onClick={() => handleExport(current, filter)} style={btnGhost(ACCENT)}>
                  Export CSV ({current.length})
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
            {/* List */}
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', maxHeight: 520, overflowY: 'auto' }}>
              {current.length === 0 && <div style={{ fontSize: 12, color: MUTED, padding: 12 }}>Nothing here.</div>}
              {current.map((p) => {
                const sel = selected?.id === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', background: sel ? CARD : 'transparent', borderLeft: `2px solid ${sel ? ACCENT : 'transparent'}` }}
                  >
                    <div style={{ fontSize: 13, fontWeight: sel ? 600 : 400, color: '#ddd' }}>{p.recipient_name ?? p.domain}</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{p.email}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                      {p.needs_review ? <Pill label="review" color="#e0a060" /> : p.draft!.is_template ? <Pill label="template" color={MUTED} /> : <Pill label="personalized" color="#1D9E75" />}
                      {!p.draft!.clean && <Pill label="drift" color="#b04545" />}
                      {p.draft!.status === 'approved' && <Pill label="approved" color="#1D9E75" />}
                      {p.draft!.status === 'exported' && <Pill label="exported" color="#378ADD" />}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Detail */}
            <div>
              {selected ? (
                <DraftDetail key={selected.draft!.id} prospect={selected} companyId={companyId} onChanged={refresh} />
              ) : (
                <div style={{ fontSize: 12, color: MUTED, padding: 16 }}>Select a prospect to review its draft.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
