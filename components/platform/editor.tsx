'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Check, CalendarDays, ImageIcon, Eye, FileText } from 'lucide-react'
import { usePlatform } from './provider'
import { CHANNELS, type Channel, type ContentItem, type Contact, type Campaign } from '@/lib/platform/types'

function localDate(iso: string | null) { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
export function Editor() {
  const { editor } = usePlatform()
  return editor ? <EditorForm key={`${editor.kind}:${editor.item?.id ?? 'new'}`} /> : null
}
function EditorForm() {
  const { editor, setEditor, companyId, companyName, data, persistContent, persistContact, persistCampaign } = usePlatform()
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState(editor?.item && 'title' in editor.item ? editor.item.title : editor?.item && 'name' in editor.item ? editor.item.name : '')
  const [body, setBody] = useState(editor?.kind === 'content' ? editor.item?.body ?? '' : editor?.kind === 'campaign' ? editor.item?.objective ?? '' : editor?.item?.notes ?? '')
  const [channels, setChannels] = useState<Channel[]>(editor?.kind === 'content' ? editor.item?.channels ?? [editor.channel ?? 'linkedin'] : ['email'])
  const [status, setStatus] = useState(editor?.kind === 'content' ? editor.item?.status ?? 'draft' : 'draft')
  const [date, setDate] = useState(editor?.kind === 'content' ? localDate(editor.item?.planned_at ?? editor.date ?? null) : '')
  const [campaign, setCampaign] = useState(editor?.kind === 'content' ? editor.item?.campaign_id ?? '' : '')
  const [image, setImage] = useState(editor?.kind === 'content' ? editor.item?.image_url ?? '' : '')
  const [email, setEmail] = useState(editor?.kind === 'contact' ? editor.item?.email ?? '' : '')
  const [organization, setOrganization] = useState(editor?.kind === 'contact' ? editor.item?.organization ?? '' : '')
  const [tags, setTags] = useState(editor?.kind === 'contact' ? editor.item?.tags.join(', ') ?? '' : '')
  const [subscription, setSubscription] = useState<Contact['subscription']>(editor?.kind === 'contact' ? editor.item?.subscription ?? 'not_subscribed' : 'not_subscribed')
  const [consent, setConsent] = useState(editor?.kind === 'contact' ? editor.item?.consent_note ?? '' : '')
  const [campaignStatus, setCampaignStatus] = useState<Campaign['status']>(editor?.kind === 'campaign' ? editor.item?.status ?? 'draft' : 'draft')
  useEffect(() => { dialog.current?.showModal() }, [])
  if (!editor) return null
  const isContent = editor.kind === 'content'
  const close = () => { if (!busy) setEditor(null) }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!editor) return
    setBusy(true); setError('')
    const now = new Date().toISOString()
    const base = { id: editor.item?.id ?? crypto.randomUUID(), company_id: companyId, created_at: editor.item?.created_at ?? now, updated_at: now }
    try {
      const result = editor.kind === 'content'
        ? await persistContent({ ...base, title, body, channels, status: status as ContentItem['status'], planned_at: date ? new Date(date).toISOString() : null, campaign_id: campaign || null, image_url: image || null })
        : editor.kind === 'contact'
          ? await persistContact({ ...base, name: title, email, organization, tags: tags.split(',').map(t => t.trim()).filter(Boolean), subscription, consent_note: consent, notes: body })
          : await persistCampaign({ ...base, name: title, objective: body, status: campaignStatus })
      if (result.ok) setEditor(null); else setError(result.error)
    } catch { setError('Check the form and try again.') } finally { setBusy(false) }
  }
  return <dialog ref={dialog} className={`sg-editor ${isContent ? 'sg-editor-wide' : ''}`} onCancel={e => { e.preventDefault(); close() }} onClick={e => { if (e.target === e.currentTarget) close() }} aria-labelledby="editor-title">
    <form onSubmit={save}>
      <header className="sg-editor-header"><div><h2 id="editor-title">{editor.item ? 'Edit' : 'Create'} {editor.kind === 'content' ? channels.length === 1 && channels[0] === 'email' ? 'email draft' : 'content' : editor.kind}</h2><p>{isContent ? 'One idea. Make it work across your channels.' : editor.kind === 'contact' ? 'Keep the person behind the conversation in view.' : 'Bring your email and social content together.'}</p></div><button className="sg-icon-button" type="button" onClick={close} aria-label="Close editor"><X size={20} /></button></header>
      <div className={isContent ? 'sg-editor-columns' : 'sg-editor-single'}><div className="sg-form-fields">
        {isContent && <fieldset><legend>Channels</legend><div className="sg-channel-options">{Object.entries(CHANNELS).map(([id, channel]) => <label key={id} className={`sg-channel-option ${channels.includes(id as Channel) ? 'selected' : ''}`}><input type="checkbox" checked={channels.includes(id as Channel)} onChange={e => setChannels(e.target.checked ? [...channels, id as Channel] : channels.filter(c => c !== id))} /><span className="sg-channel-badge" style={{ background: channel.color }}>{channel.short}</span>{channel.label}</label>)}</div></fieldset>}
        <label>{editor.kind === 'contact' ? 'Full name' : editor.kind === 'campaign' ? 'Campaign name' : 'Title / email subject'}<input autoFocus required maxLength={180} value={title} onChange={e => setTitle(e.target.value)} placeholder={editor.kind === 'contact' ? 'Alex Morgan' : 'Give this a memorable name'} /></label>
        {editor.kind === 'contact' && <><label>Email address<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="alex@company.com" /></label><label>Organization<input value={organization} onChange={e => setOrganization(e.target.value)} /></label><label>Tags<span className="sg-field-hint">Separate with commas</span><input value={tags} onChange={e => setTags(e.target.value)} placeholder="Client, Newsletter" /></label><label>Email subscription<select value={subscription} onChange={e => setSubscription(e.target.value as Contact['subscription'])}><option value="not_subscribed">Not subscribed</option><option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option></select></label>{subscription === 'subscribed' && <label>Subscription record<span className="sg-field-hint">Where and when did this person opt in?</span><input required value={consent} onChange={e => setConsent(e.target.value)} /></label>}</>}
        <label>{editor.kind === 'contact' ? 'Notes' : editor.kind === 'campaign' ? 'Objective' : 'Your message'}<textarea rows={isContent ? 9 : 4} value={body} maxLength={50000} onChange={e => setBody(e.target.value)} placeholder={isContent ? 'Start a conversation. Share something worth reading.' : 'Add a little context…'} /></label>
        {isContent && <><div className="sg-editor-meta"><span>{body.length.toLocaleString()} characters</span><span><FileText size={13} />Text draft</span></div><label><span className="sg-row"><ImageIcon size={14} />Image reference URL <span className="sg-field-hint">Optional</span></span><input type="url" placeholder="https://…" value={image} onChange={e => setImage(e.target.value)} /></label><div className="sg-form-grid"><label>Campaign<select value={campaign} onChange={e => setCampaign(e.target.value)}><option value="">No campaign</option>{data.campaigns.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Status<select value={status} onChange={e => setStatus(e.target.value as ContentItem['status'])}><option value="draft">Draft</option><option value="review">Needs review</option><option value="approved">Approved</option><option value="planned">Planned</option><option value="archived">Archived</option></select></label></div><label><span className="sg-row"><CalendarDays size={14} />Planned date & time</span><input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} required={status === 'planned'} /><span className="sg-field-hint">Your local time zone. Planning does not automatically publish or send.</span></label></>}
        {editor.kind === 'campaign' && <label>Status<select value={campaignStatus} onChange={e => setCampaignStatus(e.target.value as Campaign['status'])}><option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option></select><span className="sg-field-hint">Campaign status organizes your work; it does not start delivery.</span></label>}
      </div>
      {isContent && <aside className="sg-content-preview"><div className="sg-preview-label"><Eye size={15} />Content preview</div><article className="sg-post-preview"><div className="sg-row"><span className="sg-company-avatar">{companyName.slice(0, 1)}</span><div><strong>{companyName}</strong><small>Draft preview</small></div></div><h3>{title || 'Your next good idea'}</h3><p>{body || 'As you write, your message will take shape here.'}</p>{image && <div className="sg-media-reference"><ImageIcon size={24} /><span>Image reference attached</span></div>}<div className="sg-preview-bottom">{channels.map(c => <span key={c} className="sg-channel-badge" style={{ background: CHANNELS[c].color }}>{CHANNELS[c].short}</span>)}</div></article><p className="sg-caption">A text preview, not a platform rendering. Final formatting depends on the channel.</p><div className="sg-callout">Draft, review, and plan here. Automatic social publishing and newsletter delivery need their delivery integrations.</div></aside>}
      </div>
      <footer className="sg-editor-footer">{error && <p className="sg-form-error" role="alert">{error}</p>}<button type="button" className="sg-button" onClick={close} disabled={busy}>Cancel</button><button type="submit" className="sg-button sg-primary" disabled={busy}><Check size={16} />{busy ? 'Saving…' : 'Save changes'}</button></footer>
    </form>
  </dialog>
}
