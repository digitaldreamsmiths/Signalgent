'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { listTemplates, createTemplate, updateTemplate, deleteTemplate } from '@/lib/integrations/outreach/template-actions'
import type { OutreachTemplate, OutreachProspectView } from '@/lib/integrations/outreach/types'

const BORDER = 'var(--app-border)'
const CARD = 'var(--app-card)'
const CARD2 = 'var(--app-card-2)'
const INPUT = 'var(--app-input)'
const TEXT = 'var(--app-text)'
const TEXT2 = 'var(--app-text-2)'
const MUTED = 'var(--app-muted)'
const ACCENT = '#D85A30'

type Stat = { assigned: number; sent: number; replied: number; bounced: number; optout: number }
type FormState = { id: string | null; name: string; subject: string; body: string; weight: number; active: boolean }

const EMPTY_FORM: FormState = { id: null, name: '', subject: '', body: '', weight: 1, active: true }

const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' }
const inputStyle: React.CSSProperties = { width: '100%', background: INPUT, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, padding: '7px 9px' }
function btn(bg: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: '#fff', background: bg, border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }
}
function btnGhost(color = TEXT2): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }
}
function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '—'
}

export function TemplatesModal({
  companyId,
  prospects,
  onClose,
  onChanged,
}: {
  companyId: string
  prospects: OutreachProspectView[]
  onClose: () => void
  onChanged: () => void
}) {
  const [templates, setTemplates] = useState<OutreachTemplate[] | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => setTemplates(await listTemplates(companyId))
  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Per-template performance from the current snapshot (fallback drafts carry
  // template_id; outcome comes from the prospect's disposition once sent).
  const stats = useMemo(() => {
    const m = new Map<string, Stat>()
    const get = (id: string) => {
      let s = m.get(id)
      if (!s) { s = { assigned: 0, sent: 0, replied: 0, bounced: 0, optout: 0 }; m.set(id, s) }
      return s
    }
    for (const p of prospects) {
      for (const d of p.drafts) {
        if (!d.template_id) continue
        const s = get(d.template_id)
        s.assigned += 1
        const sent = d.status === 'exported' || d.send?.status === 'sent'
        if (!sent) continue
        s.sent += 1
        if (p.disposition === 'replied' || p.disposition === 'interested' || p.disposition === 'not_interested') s.replied += 1
        else if (p.disposition === 'bounced') s.bounced += 1
        else if (p.disposition === 'unsubscribed') s.optout += 1
      }
    }
    return m
  }, [prospects])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  async function handleSave() {
    if (!form) return
    setBusy(true)
    setError(null)
    const r = form.id
      ? await updateTemplate(companyId, form.id, { name: form.name, subject: form.subject, body: form.body, weight: form.weight, active: form.active })
      : await createTemplate(companyId, { name: form.name, subject: form.subject, body: form.body, weight: form.weight, active: form.active })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setForm(null)
    await load()
    onChanged()
  }

  async function toggleActive(t: OutreachTemplate) {
    setBusy(true)
    setError(null)
    const r = await updateTemplate(companyId, t.id, { active: !t.active })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    await load()
    onChanged()
  }

  async function handleDelete(id: string) {
    setBusy(true)
    setError(null)
    const r = await deleteTemplate(companyId, id)
    setBusy(false)
    setConfirmDelete(null)
    if (!r.ok) return setError(r.error)
    if (form?.id === id) setForm(null)
    await load()
    onChanged()
  }

  async function handleUpload(file: File) {
    const text = await file.text()
    const lines = text.split('\n')
    let subject = ''
    let body = text
    const m = lines[0]?.match(/^\s*subject:\s*(.+)$/i)
    if (m) { subject = m[1].trim(); body = lines.slice(1).join('\n').replace(/^\n+/, '') }
    const nameFromFile = file.name.replace(/\.[^.]+$/, '')
    setForm((f) => ({
      ...(f ?? EMPTY_FORM),
      name: f?.name || nameFromFile,
      subject: subject || f?.subject || '',
      body,
    }))
  }

  const active = (templates ?? []).filter((t) => t.active)

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 560, maxHeight: '82vh', overflowY: 'auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0 }}>Templates</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, marginBottom: 14 }}>
          Used for prospects that can’t be personalized from federal data. Each fallback email picks a random <b style={{ color: TEXT2 }}>active</b> template (weighted). Use <code style={{ color: ACCENT }}>{'{company}'}</code> to insert the recipient’s name. Personalized emails are unaffected.
        </div>

        {error && <div style={{ fontSize: 11, color: '#d98a8a', marginBottom: 10 }}>{error}</div>}

        {/* List */}
        {templates === null ? (
          <div style={{ fontSize: 12, color: MUTED, padding: 8 }}>Loading…</div>
        ) : templates.length === 0 ? (
          <div style={{ fontSize: 12, color: MUTED, padding: '8px 0' }}>No templates yet — the built-in default is used until you add one.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {templates.map((t) => {
              const s = stats.get(t.id)
              return (
                <div key={t.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, background: t.active ? CARD2 : 'transparent', opacity: t.active ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title={t.active ? 'Active — in rotation' : 'Inactive — not sent'}>
                      <input type="checkbox" checked={t.active} disabled={busy} onChange={() => toggleActive(t)} />
                    </label>
                    <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    <span style={{ fontSize: 10, color: MUTED }}>weight {t.weight}</span>
                    <button disabled={busy} onClick={() => { setError(null); setForm({ id: t.id, name: t.name, subject: t.subject, body: t.body, weight: t.weight, active: t.active }) }} style={btnGhost()}>Edit</button>
                    {confirmDelete === t.id ? (
                      <>
                        <button disabled={busy} onClick={() => handleDelete(t.id)} style={btn('#b04545')}>Confirm</button>
                        <button disabled={busy} onClick={() => setConfirmDelete(null)} style={btnGhost()}>Cancel</button>
                      </>
                    ) : (
                      <button disabled={busy} onClick={() => setConfirmDelete(t.id)} style={btnGhost('#b04545')}>Delete</button>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{s?.assigned ?? 0} assigned</span>
                    <span>{s?.sent ?? 0} sent</span>
                    <span style={{ color: (s?.sent ?? 0) > 0 ? '#1D9E75' : MUTED }}>reply {pct(s?.replied ?? 0, s?.sent ?? 0)}</span>
                    <span>bounce {pct(s?.bounced ?? 0, s?.sent ?? 0)}</span>
                    <span style={{ color: (s?.optout ?? 0) > 0 ? '#b04545' : MUTED }}>opt-out {pct(s?.optout ?? 0, s?.sent ?? 0)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {templates !== null && active.length === 0 && templates.length > 0 && (
          <div style={{ fontSize: 11, color: '#e0a060', marginBottom: 10 }}>No active templates — the built-in default is used until you activate one.</div>
        )}

        {/* Editor */}
        {form ? (
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{form.id ? 'Edit template' : 'New template'}</span>
              <button onClick={() => fileRef.current?.click()} style={btnGhost()}>Upload file…</button>
              <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.currentTarget.value = '' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Name</label>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Proposal-load, short" style={inputStyle} />
              </div>
              <div style={{ width: 90 }}>
                <label style={labelStyle}>Weight</label>
                <input type="number" min={1} value={form.weight} onChange={(e) => set('weight', Math.max(1, Number(e.target.value) || 1))} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Subject</label>
              <input value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="A lighter proposal load for {company}" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Body</label>
              <textarea value={form.body} onChange={(e) => set('body', e.target.value)} rows={8} placeholder={'Hi,\n\nI work with government contractors…\n\nBest,\nEudon'} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: TEXT2, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Active (include in rotation)
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button disabled={busy} onClick={() => { setForm(null); setError(null) }} style={btnGhost()}>Cancel</button>
              <button disabled={busy} onClick={handleSave} style={btn(ACCENT)}>{busy ? 'Saving…' : form.id ? 'Save changes' : 'Add template'}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setError(null); setForm({ ...EMPTY_FORM }) }} style={btn(ACCENT)}>New template</button>
        )}
      </div>
    </div>
  )
}
