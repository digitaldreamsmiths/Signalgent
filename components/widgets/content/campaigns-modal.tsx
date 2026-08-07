'use client'

import { useState } from 'react'
import { createCampaign, updateCampaign } from '@/lib/integrations/outreach/campaign-actions'
import type { OutreachCampaign } from '@/lib/integrations/outreach/campaigns'

const BORDER = 'var(--app-border)'
const CARD = 'var(--app-card)'
const INPUT = 'var(--app-input)'
const TEXT = 'var(--app-text)'
const MUTED = 'var(--app-muted)'
const ACCENT = '#D85A30'

const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' }
const inputStyle: React.CSSProperties = { width: '100%', background: INPUT, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, padding: '7px 9px' }
const btnGhost = (color = 'var(--app-text-2)'): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, color, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer' })

/** Per-campaign editor row: rename, archive, and follow-up overrides
 * (blank/inherit = the company-level Sending settings value). */
function CampaignRow({ campaign, count, companyId, onChanged, onError }: {
  campaign: OutreachCampaign
  count: number
  companyId: string
  onChanged: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(campaign.name)
  const [busy, setBusy] = useState(false)

  const patch = async (p: Parameters<typeof updateCampaign>[2]) => {
    setBusy(true)
    const r = await updateCampaign(companyId, campaign.id, p)
    setBusy(false)
    if (!r.ok) return onError(r.error)
    onChanged()
  }

  const archived = campaign.status === 'archived'
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, opacity: archived ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== campaign.name) patch({ name }) }}
          style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
          disabled={busy}
        />
        <span style={{ fontSize: 10, color: MUTED, whiteSpace: 'nowrap' }}>{count} prospect{count === 1 ? '' : 's'}</span>
        <button
          disabled={busy}
          onClick={() => patch({ status: archived ? 'active' : 'archived' })}
          style={btnGhost(archived ? '#1D9E75' : MUTED)}
          title={archived ? 'Reactivate — sequences resume per its settings' : 'Archive — stops this campaign’s follow-up sequences'}
        >
          {archived ? 'Restore' : 'Archive'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div>
          <label style={labelStyle}>Follow-ups</label>
          <select
            value={campaign.followup_enabled === null ? 'inherit' : campaign.followup_enabled ? 'on' : 'off'}
            onChange={(e) => patch({ followup_enabled: e.target.value === 'inherit' ? null : e.target.value === 'on' })}
            disabled={busy}
            style={inputStyle}
          >
            <option value="inherit">Inherit</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Wait (biz days)</label>
          <input
            type="number"
            placeholder="inherit"
            value={campaign.followup_wait_days ?? ''}
            onChange={(e) => patch({ followup_wait_days: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value) || 1) })}
            disabled={busy}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Max touches</label>
          <input
            type="number"
            placeholder="inherit"
            value={campaign.followup_max_touches ?? ''}
            onChange={(e) => patch({ followup_max_touches: e.target.value === '' ? null : Math.max(1, parseInt(e.target.value) || 1) })}
            disabled={busy}
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  )
}

export function CampaignsModal({ companyId, campaigns, countByCampaign, onClose, onChanged }: {
  companyId: string
  campaigns: OutreachCampaign[]
  /** Prospect count per campaign id (from the snapshot). */
  countByCampaign: Map<string, number>
  onClose: () => void
  onChanged: () => void
}) {
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!newName.trim()) return
    setBusy(true)
    setError(null)
    const r = await createCampaign(companyId, newName)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setNewName('')
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]" onClick={onClose} style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, width: 520, maxWidth: 'calc(100vw - 32px)', maxHeight: '78vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Campaigns</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 16, minHeight: 'auto' }}>×</button>
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: -6, lineHeight: 1.5 }}>
          A campaign is a named slice of your prospect list. New prospects join whichever campaign is selected
          in the workspace when you add them; follow-up overrides beat the company-level Sending settings.
          Archiving stops a campaign’s sequences and returns nothing — prospects stay put.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create() }}
            placeholder="New campaign name…"
            style={{ ...inputStyle, flex: 1 }}
            disabled={busy}
          />
          <button onClick={create} disabled={busy || !newName.trim()} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: ACCENT, border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer' }}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>

        {error && <div style={{ fontSize: 11, color: '#d98a8a' }}>{error}</div>}

        {campaigns.length === 0 && (
          <div style={{ fontSize: 12, color: MUTED, padding: '8px 0' }}>No campaigns yet — everything lives in the shared pool until you create one.</div>
        )}
        {campaigns.map((c) => (
          <CampaignRow
            key={c.id}
            campaign={c}
            count={countByCampaign.get(c.id) ?? 0}
            companyId={companyId}
            onChanged={onChanged}
            onError={setError}
          />
        ))}
      </div>
    </div>
  )
}
