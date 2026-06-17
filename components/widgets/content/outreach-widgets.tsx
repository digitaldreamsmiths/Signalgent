'use client'

import { useCallback, useEffect, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import {
  approveDraft,
  editDraft,
  getOutreachSnapshot,
  ingestProspects,
  rejectDraft,
  runNewProspects,
} from '@/lib/integrations/outreach/actions'
import type { OutreachSnapshot, OutreachProspectView } from '@/lib/integrations/outreach/types'

const ACCENT = '#D85A30'
const BORDER = '#272727'
const CARD = '#1a1a1a'
const MUTED = '#8a8a8a'

type Filter = 'review' | 'templates' | 'approved' | 'all'

function btn(bg: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: '#fff', background: bg, border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}
function btnGhost(color = '#ccc'): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
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
    draft.status === 'approved' ? '#1D9E75' : draft.status === 'rejected' ? '#b04545' : draft.status === 'edited' ? '#BA7517' : ACCENT

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

  const handleRun = useCallback(async () => {
    if (!companyId) return
    setRunning(true)
    setNotice(null)
    const r = await runNewProspects(companyId)
    setRunning(false)
    if (!r.ok) return setNotice(r.error)
    setNotice(`Processed ${r.data.processed}: ${r.data.drafted} personalized, ${r.data.skipped} template. ${r.data.remaining} left.`)
    refresh()
  }, [companyId, refresh])

  if (!companyId) return <div style={{ fontSize: 12, color: MUTED }}>Select a company to start outreach.</div>

  const prospects = snapshot?.prospects ?? []
  const c = snapshot?.counts
  const withDraft = prospects.filter((p) => p.draft)
  const lists: Record<Filter, OutreachProspectView[]> = {
    review: withDraft.filter((p) => !p.draft!.is_template && p.draft!.status === 'pending'),
    templates: withDraft.filter((p) => p.draft!.is_template && p.draft!.status === 'pending'),
    approved: withDraft.filter((p) => p.draft!.status === 'approved'),
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
            {c.total} total · {c.personalized} personalized · {c.templates} template · {c.approved} approved
          </span>
        )}
      </div>
      {notice && <div style={{ fontSize: 11, color: '#aaa' }}>{notice}</div>}

      {loading && !snapshot && <div style={{ fontSize: 12, color: MUTED }}>Loading…</div>}
      {!loading && prospects.length === 0 && (
        <div style={{ fontSize: 12, color: MUTED }}>No prospects yet. Paste a contact list above to begin.</div>
      )}

      {prospects.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${BORDER}` }}>
            {tab('review', 'To review', lists.review.length)}
            {tab('templates', 'Templates', lists.templates.length)}
            {tab('approved', 'Approved', lists.approved.length)}
            {tab('all', 'All', lists.all.length)}
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
                      {p.draft!.is_template ? <Pill label="template" color={MUTED} /> : <Pill label="personalized" color="#1D9E75" />}
                      {!p.draft!.clean && <Pill label="drift" color="#b04545" />}
                      {p.draft!.status === 'approved' && <Pill label="approved" color="#1D9E75" />}
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
