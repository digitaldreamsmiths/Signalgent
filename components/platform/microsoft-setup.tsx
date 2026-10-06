'use client'

import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'

interface ConfigState { configured: boolean; tenantId: string; clientId: string; redirectUri: string }

/**
 * Per-company Microsoft Entra app registration. Each company signs its
 * mailbox in through its own tenant and application, so the form collects the
 * three values from that registration. The secret is write-only: it is stored
 * encrypted and never returned.
 */
export function MicrosoftSetup({ companyId, preview, onChange }: { companyId: string; preview: boolean; onChange: (configured: boolean) => void }) {
  const [state, setState] = useState<ConfigState | null>(null)
  const [editing, setEditing] = useState(false)
  const [tenantId, setTenantId] = useState('')
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (preview || !companyId) return
    let cancelled = false
    fetch(`/api/integrations/outlook/config?companyId=${encodeURIComponent(companyId)}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Setup could not be loaded'); return r.json() as Promise<ConfigState> })
      .then(data => { if (cancelled) return; setState(data); setTenantId(data.tenantId); setClientId(data.clientId); setEditing(!data.configured); onChange(data.configured) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Setup could not be loaded') })
    return () => { cancelled = true }
  }, [companyId, preview, onChange])

  if (preview) return <p className="sg-setup-note">Each company adds its own Microsoft app registration here. Disabled in the sample workspace.</p>
  if (!state) return error ? <p className="sg-account-error">{error}</p> : <p className="sg-setup-note">Loading Microsoft setup…</p>

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    try {
      const r = await fetch('/api/integrations/outlook/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, tenantId, clientId, clientSecret: secret }),
      })
      const body = await r.json().catch(() => ({})) as { error?: string; configured?: boolean }
      if (!r.ok) throw new Error(body.error ?? 'Setup could not be saved')
      setState(s => s ? { ...s, configured: true, tenantId, clientId } : s)
      setSecret(''); setEditing(false); setSaved(true); onChange(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup could not be saved')
    } finally { setSaving(false) }
  }

  const changed = state.configured && (tenantId !== state.tenantId || clientId !== state.clientId)

  return <div className="sg-setup">
    <div className="sg-account-row"><KeyRound size={13} /><span className="sg-account-label">App registration</span>
      <span className={`sg-status ${state.configured ? 'sg-status-connected' : 'sg-status-error'}`}><span />{state.configured ? 'Saved' : 'Required'}</span></div>
    {state.configured && !editing && <>
      <p className="sg-setup-note">Tenant {state.tenantId}<br />Application {state.clientId}</p>
      {saved && <p className="sg-setup-note" role="status">Saved. Connect the mailbox below.</p>}
      <button type="button" className="sg-button sg-compact sg-quiet" onClick={() => { setEditing(true); setSaved(false) }}>Change registration</button>
    </>}
    {editing && <form className="sg-form-fields sg-setup-form" onSubmit={save}>
      <p className="sg-setup-note">In Microsoft Entra, register a single-tenant application with the Web redirect URI below, add the delegated Microsoft Graph permissions offline_access, User.Read, and Mail.Send, then create a client secret.</p>
      <label>Redirect URI<input type="text" readOnly value={state.redirectUri} onFocus={e => e.currentTarget.select()} /></label>
      <label>Directory (tenant) ID<input type="text" required value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off" /></label>
      <label>Application (client) ID<input type="text" required value={clientId} onChange={e => setClientId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off" /></label>
      <label>Client secret value<input type="password" required={!state.configured || changed} value={secret} onChange={e => setSecret(e.target.value)} placeholder={state.configured && !changed ? 'Leave blank to keep the current secret' : 'Paste the secret Value, not the Secret ID'} autoComplete="new-password" />
        {state.configured && <span className="sg-field-hint">Saving a new secret disconnects the current mailbox. Reconnect it afterward.</span>}</label>
      {error && <p className="sg-form-error">{error}</p>}
      <div className="sg-row">
        <button type="submit" className="sg-button sg-compact sg-primary" disabled={saving}>{saving ? 'Saving…' : 'Save registration'}</button>
        {state.configured && <button type="button" className="sg-button sg-compact sg-quiet" onClick={() => { setEditing(false); setError(null); setTenantId(state.tenantId); setClientId(state.clientId); setSecret('') }}>Cancel</button>}
      </div>
    </form>}
  </div>
}
