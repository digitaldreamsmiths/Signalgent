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

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {label}
    </span>
  )
}

function DraftCard({
  prospect,
  companyId,
  onChanged,
}: {
  prospect: OutreachProspectView
  companyId: string
  onChanged: () => void
}) {
  const draft = prospect.draft!
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
      setBusy(true)
      setError(null)
      const r = await fn()
      setBusy(false)
      if (!r.ok) setError(r.error ?? 'Something went wrong.')
      else onChanged()
    },
    [onChanged],
  )

  const statusColor =
    draft.status === 'approved' ? '#1D9E75' : draft.status === 'rejected' ? '#b04545' : draft.status === 'edited' ? '#BA7517' : ACCENT

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, background: CARD }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#eee' }}>
          {prospect.recipient_name ?? prospect.domain}
          <span style={{ color: MUTED, fontWeight: 400, marginLeft: 8 }}>{prospect.email}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!draft.clean && <StatusPill label="drift" color="#b04545" />}
          {prospect.resolution_confidence != null && (
            <span style={{ fontSize: 10, color: MUTED }}>res {prospect.resolution_confidence.toFixed(2)}</span>
          )}
          {draft.synthesis_confidence != null && (
            <span style={{ fontSize: 10, color: MUTED }}>fit {draft.synthesis_confidence.toFixed(2)}</span>
          )}
          <StatusPill label={draft.status} color={statusColor} />
        </div>
      </div>

      {!draft.clean && draft.drifted_facts.length > 0 && (
        <div style={{ fontSize: 11, color: '#d98a8a', marginBottom: 6 }}>
          Used facts not in the approved set: {draft.drifted_facts.join('; ')}
        </div>
      )}

      {editing ? (
        <>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ width: '100%', background: '#111', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#eee', fontSize: 12, padding: '6px 8px', marginBottom: 6 }}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            style={{ width: '100%', background: '#111', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#eee', fontSize: 12, padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit' }}
          />
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ccc', marginBottom: 4 }}>{draft.subject}</div>
          <div style={{ fontSize: 12, color: '#bbb', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{draft.body}</div>
        </>
      )}

      {error && <div style={{ fontSize: 11, color: '#d98a8a', marginTop: 6 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {editing ? (
          <>
            <button disabled={busy} onClick={() => act(() => editDraft(companyId, draft.id, subject, body)).then(() => setEditing(false))} style={btn(ACCENT)}>
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

function btn(bg: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: '#fff', background: bg, border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}
function btnGhost(color = '#ccc'): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }
}

export function OutreachReviewQueue() {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [snapshot, setSnapshot] = useState<OutreachSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [raw, setRaw] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  // Reusable by the action handlers (outside effects, so setState is fine here).
  const refresh = useCallback(async () => {
    if (!companyId) return
    const snap = await getOutreachSnapshot(companyId)
    setSnapshot(snap)
  }, [companyId])

  // Initial load — state is only set after the await, never synchronously.
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
    if (!r.ok) {
      setNotice(r.error)
      return
    }
    setRaw('')
    setNotice(`Added ${r.data.added} prospect(s). ${r.data.duplicates} duplicate(s), ${r.data.invalid} invalid.`)
    refresh()
  }, [companyId, raw, refresh])

  const handleRun = useCallback(async () => {
    if (!companyId) return
    setRunning(true)
    setNotice(null)
    const r = await runNewProspects(companyId)
    setRunning(false)
    if (!r.ok) {
      setNotice(r.error)
      return
    }
    setNotice(`Processed ${r.data.processed}: ${r.data.drafted} drafted, ${r.data.skipped} skipped. ${r.data.remaining} remaining.`)
    refresh()
  }, [companyId, refresh])

  if (!companyId) return <div style={{ fontSize: 12, color: MUTED }}>Select a company to start outreach.</div>

  const prospects = snapshot?.prospects ?? []
  const drafts = prospects.filter((p) => p.draft && p.status === 'drafted')
  const skips = prospects.filter((p) => p.status === 'skipped')
  const fresh = prospects.filter((p) => p.status === 'new')
  const c = snapshot?.counts

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Ingest */}
      <div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={3}
          placeholder="Paste contact emails (any separator)…"
          style={{ width: '100%', background: '#111', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#eee', fontSize: 12, padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleIngest} disabled={!raw.trim()} style={btn(ACCENT)}>
            Add prospects
          </button>
          <button onClick={handleRun} disabled={running || (c?.new ?? 0) === 0} style={btnGhost(ACCENT)}>
            {running ? 'Running…' : `Run enrichment${c?.new ? ` (${c.new} new)` : ''}`}
          </button>
          {c && (
            <span style={{ fontSize: 11, color: MUTED, marginLeft: 'auto' }}>
              {c.total} total · {c.drafted} drafted · {c.skipped} skipped · {c.approved} approved
            </span>
          )}
        </div>
        {notice && <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{notice}</div>}
      </div>

      {loading && !snapshot && <div style={{ fontSize: 12, color: MUTED }}>Loading…</div>}

      {/* Draft review queue */}
      {drafts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Review queue ({drafts.length})
          </div>
          {drafts.map((p) => (
            <DraftCard key={p.id} prospect={p} companyId={companyId} onChanged={refresh} />
          ))}
        </div>
      )}

      {/* Skip pile */}
      {skips.length > 0 && (
        <details>
          <summary style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer' }}>
            Skip pile ({skips.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {skips.map((p) => (
              <div key={p.id} style={{ fontSize: 11, color: MUTED, display: 'flex', gap: 8 }}>
                <span style={{ color: '#999', minWidth: 200 }}>{p.recipient_name ?? p.email}</span>
                <span style={{ color: '#666' }}>[{p.skip_stage}]</span>
                <span>{p.skip_reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {fresh.length > 0 && (
        <div style={{ fontSize: 11, color: MUTED }}>{fresh.length} prospect(s) waiting — click Run enrichment.</div>
      )}

      {!loading && prospects.length === 0 && (
        <div style={{ fontSize: 12, color: MUTED }}>No prospects yet. Paste a contact list above to begin.</div>
      )}
    </div>
  )
}
