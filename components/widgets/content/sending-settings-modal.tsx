'use client'

import { useEffect, useState } from 'react'
import { getSendSettings, saveSendSettings } from '@/lib/integrations/outreach/sending'
import type { SendSettings } from '@/lib/integrations/outreach/types'

const BORDER = 'var(--app-border)'
const CARD = 'var(--app-card)'
const INPUT = 'var(--app-input)'
const TEXT = 'var(--app-text)'
const MUTED = 'var(--app-muted)'
const ACCENT = '#D85A30'

const DEFAULTS: SendSettings = {
  sender_name: '', sender_email: '', reply_to: '',
  daily_send_limit: 25, send_window_start: '09:00', send_window_end: '17:00',
  timezone: 'America/New_York', min_gap_minutes: 6,
  signature: '', physical_address: '', unsubscribe_line: '',
  provider: 'dry_run', active: false, pause_reason: null,
  warmup_enabled: true, warmup_start_per_day: 10, warmup_increment_per_day: 5, warmup_started_at: null,
  bounce_pause_enabled: true, bounce_pause_threshold: 0.05, bounce_pause_window_days: 7, bounce_pause_min_sends: 20,
  followup_enabled: false, followup_wait_days: 4, followup_max_touches: 3,
}

const sectionStyle: React.CSSProperties = { borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: TEXT, margin: 0 }

const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' }
const inputStyle: React.CSSProperties = { width: '100%', background: INPUT, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, padding: '7px 9px' }

export function SendingSettingsModal({ companyId, onClose, onSaved }: { companyId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<SendSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const s = await getSendSettings(companyId)
      if (active) setForm(s ?? { ...DEFAULTS })
    })()
    return () => { active = false }
  }, [companyId])

  function set<K extends keyof SendSettings>(key: K, value: SendSettings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  async function handleSave() {
    if (!form) return
    setBusy(true)
    setError(null)
    const r = await saveSendSettings(companyId, form)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 460, maxHeight: '78vh', overflowY: 'auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0 }}>Sending settings</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {!form ? (
          <div style={{ fontSize: 12, color: MUTED }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!form.active && form.pause_reason === 'bounce_rate' && (
              <div style={{ fontSize: 11, color: '#e0a060', background: 'var(--app-card-2)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px' }}>
                Auto-paused — recent bounce rate exceeded {Math.round(form.bounce_pause_threshold * 100)}%. Clean the list, then re-enable sending below to resume.
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: TEXT }}>
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
              Sending enabled (drafts can be queued and sent)
            </label>

            <div>
              <label style={labelStyle}>Provider</label>
              <select value={form.provider} onChange={(e) => set('provider', e.target.value as SendSettings['provider'])} style={inputStyle}>
                <option value="dry_run">Dry run (test — records sent, no real email)</option>
                <option value="gmail">Gmail (sends from your connected mailbox)</option>
                <option value="resend" disabled>Resend (coming soon)</option>
              </select>
              {form.provider === 'gmail' && (
                <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Connect Gmail in Settings → Connections (grants send access). Sends from the connected mailbox.</div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={labelStyle}>Sender name</label><input value={form.sender_name ?? ''} onChange={(e) => set('sender_name', e.target.value)} style={inputStyle} placeholder="Eudon Delemar" /></div>
              <div><label style={labelStyle}>Sender email</label><input value={form.sender_email ?? ''} onChange={(e) => set('sender_email', e.target.value)} style={inputStyle} placeholder="outreach@send.sourcegent.io" /></div>
            </div>
            <div><label style={labelStyle}>Reply-to</label><input value={form.reply_to ?? ''} onChange={(e) => set('reply_to', e.target.value)} style={inputStyle} placeholder="eudon@sourcegent.io" /></div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div><label style={labelStyle}>Daily limit</label><input type="number" value={form.daily_send_limit} onChange={(e) => set('daily_send_limit', Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Gap (min)</label><input type="number" value={form.min_gap_minutes} onChange={(e) => set('min_gap_minutes', Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Timezone</label><input value={form.timezone} onChange={(e) => set('timezone', e.target.value)} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={labelStyle}>Window start</label><input value={form.send_window_start} onChange={(e) => set('send_window_start', e.target.value)} style={inputStyle} placeholder="09:00" /></div>
              <div><label style={labelStyle}>Window end</label><input value={form.send_window_end} onChange={(e) => set('send_window_end', e.target.value)} style={inputStyle} placeholder="17:00" /></div>
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: -6 }}>24-hour HH:MM, or add am/pm (e.g. “8:00 pm”).</div>

            <div><label style={labelStyle}>Physical address (CAN-SPAM)</label><textarea value={form.physical_address ?? ''} onChange={(e) => set('physical_address', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="123 Main St, City, ST 00000" /></div>
            <div><label style={labelStyle}>Unsubscribe line</label><input value={form.unsubscribe_line ?? ''} onChange={(e) => set('unsubscribe_line', e.target.value)} style={inputStyle} placeholder="Reply STOP to opt out." /></div>

            {/* Warmup ramp */}
            <div style={sectionStyle}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: TEXT }}>
                <input type="checkbox" checked={form.warmup_enabled} onChange={(e) => set('warmup_enabled', e.target.checked)} />
                <span style={sectionLabel}>Warmup ramp</span>
              </label>
              <div style={{ fontSize: 10, color: MUTED, marginTop: -4 }}>
                Ramps the daily cap up to your limit over the first sending days, protecting a new mailbox's reputation.
              </div>
              {form.warmup_enabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={labelStyle}>Start / day</label><input type="number" value={form.warmup_start_per_day} onChange={(e) => set('warmup_start_per_day', Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Increase / day</label><input type="number" value={form.warmup_increment_per_day} onChange={(e) => set('warmup_increment_per_day', Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} /></div>
                </div>
              )}
            </div>

            {/* Auto-pause on bounces */}
            <div style={sectionStyle}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: TEXT }}>
                <input type="checkbox" checked={form.bounce_pause_enabled} onChange={(e) => set('bounce_pause_enabled', e.target.checked)} />
                <span style={sectionLabel}>Auto-pause on high bounce rate</span>
              </label>
              <div style={{ fontSize: 10, color: MUTED, marginTop: -4 }}>
                Stops sending automatically when too many recent emails bounce, so a bad list can't burn your domain.
              </div>
              {form.bounce_pause_enabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><label style={labelStyle}>Threshold %</label><input type="number" value={Math.round(form.bounce_pause_threshold * 100)} onChange={(e) => set('bounce_pause_threshold', Math.max(1, parseInt(e.target.value) || 1) / 100)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Window (days)</label><input type="number" value={form.bounce_pause_window_days} onChange={(e) => set('bounce_pause_window_days', Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Min sends</label><input type="number" value={form.bounce_pause_min_sends} onChange={(e) => set('bounce_pause_min_sends', Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} /></div>
                </div>
              )}
            </div>

            {/* Automatic follow-up sequences */}
            <div style={sectionStyle}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: TEXT }}>
                <input type="checkbox" checked={form.followup_enabled} onChange={(e) => set('followup_enabled', e.target.checked)} />
                <span style={sectionLabel}>Automatic follow-ups</span>
              </label>
              <div style={{ fontSize: 10, color: MUTED, marginTop: -4 }}>
                When a sent email gets no reply, the next touch is drafted and queued automatically after the wait.
                Template nudges and clean personalized drafts go straight to the queue; anything the fact-check flags
                waits in “To review”. Replies, bounces, and opt-outs always stop a sequence. Threads older than ~45
                days are left alone.
              </div>
              {form.followup_enabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={labelStyle}>Wait (business days)</label><input type="number" value={form.followup_wait_days} onChange={(e) => set('followup_wait_days', Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Max touches (incl. opener)</label><input type="number" value={form.followup_max_touches} onChange={(e) => set('followup_max_touches', Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} /></div>
                </div>
              )}
            </div>

            {error && <div style={{ fontSize: 11, color: '#d98a8a' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ fontSize: 12, fontWeight: 600, color: MUTED, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 14px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={busy} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: ACCENT, border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer' }}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
