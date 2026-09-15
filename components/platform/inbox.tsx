'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Mail, Search, Plus, RefreshCw, Archive, Send, X, ArrowLeft, Paperclip, Check, Inbox } from 'lucide-react'
import { usePlatform } from './provider'
import { readMail, readMailThread, sendMail, updateMailThread } from '@/lib/platform/mail'
import type { CommunicationsMessage } from '@/lib/integrations/comms/model'
import type { MailThread } from '@/lib/platform/mail-types'
import type { ChannelAccount } from '@/lib/platform/types'

const samples: CommunicationsMessage[] = [
  { id: 'm1', threadId: 't1', sender: { name: 'Alex Morgan', email: 'alex@example.com' }, subject: 'A few ideas for our next collaboration', snippet: 'I’ve been thinking about the workshop. Could we find a time to talk through the direction?', receivedAt: '2026-09-15T14:20:00Z', unread: true, priority: 'opportunity', tag: 'Unread', triagedPriority: null },
  { id: 'm2', threadId: 't2', sender: { name: 'Sam Rivera', email: 'sam@example.com' }, subject: 'Re: September content direction', snippet: 'Love where this is going. The first concept feels like a great fit for our audience.', receivedAt: '2026-09-15T12:05:00Z', unread: true, priority: 'opportunity', tag: 'Unread', triagedPriority: null },
  { id: 'm3', threadId: 't3', sender: { name: 'Jamie Chen', email: 'jamie@example.com' }, subject: 'Thanks for sharing your process', snippet: 'Really enjoyed the behind-the-scenes post. Looking forward to the next one!', receivedAt: '2026-09-14T16:45:00Z', unread: false, priority: 'low', tag: 'Can wait', triagedPriority: null },
]
export function InboxPage() {
  const { data, href } = usePlatform()
  const mailboxes = data.accounts.filter(a => a.service === 'gmail' && a.status === 'connected')
  const [chosen, setChosen] = useState('')
  const account = mailboxes.find(a => a.id === chosen) ?? mailboxes[0]
  return <><div className="sg-page-heading"><div><h1>Every conversation has a home.</h1><p>Read, search, and reply from your connected Gmail accounts.</p></div>{account && <select aria-label="Select mailbox" value={account.id} onChange={e => setChosen(e.target.value)}>{mailboxes.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>}</div>{account ? <Mailbox key={account.id} account={account} /> : <div className="sg-empty"><span className="sg-empty-icon"><Inbox size={28} /></span><h3>Bring your inbox into the picture</h3><p>Connect Gmail to read conversations and send replies here. Social messages and Outlook are not connected to this inbox yet.</p><Link className="sg-button sg-primary" href={href('/connections')}>Connect Gmail</Link></div>}</>
}
function Mailbox({ account }: { account: ChannelAccount }) {
  const { companyId, preview, notify } = usePlatform()
  const [messages, setMessages] = useState<CommunicationsMessage[]>(preview ? samples : [])
  const [query, setQuery] = useState('')
  const [folder, setFolder] = useState('in:inbox')
  const [search, setSearch] = useState('')
  const [next, setNext] = useState<string | undefined>()
  const [selected, setSelected] = useState<CommunicationsMessage | null>(null)
  const [thread, setThread] = useState<MailThread | null>(null)
  const [loading, setLoading] = useState(false)
  const [threadLoading, setThreadLoading] = useState(false)
  const [error, setError] = useState('')
  const [compose, setCompose] = useState<'new' | 'reply' | null>(null)
  const generation = useRef(0)
  async function load(pageToken?: string) {
    const current = ++generation.current
    setLoading(true); setError('')
    if (preview) { setMessages(samples.filter(m => `${m.subject} ${m.sender.name} ${m.snippet}`.toLowerCase().includes(search.toLowerCase()) && (folder !== 'is:unread in:inbox' || m.unread))); setLoading(false); return }
    try {
      const result = await readMail(companyId, account.id, search ? `${folder} ${search}` : folder, pageToken)
      if (current !== generation.current) return
      if (result.ok) { setMessages(old => pageToken ? [...old, ...result.data.messages.filter(m => !old.some(x => x.id === m.id))] : result.data.messages); setNext(result.data.nextPageToken) } else setError(result.error)
    } catch { if (current === generation.current) setError('Could not load messages. Try again.') } finally { if (current === generation.current) setLoading(false) }
  }
  useEffect(() => { void load(); return () => { generation.current++ } }, [folder, search]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let canceled = false
    setThread(null)
    if (!selected) return
    if (preview) { setThread({ threadId: selected.threadId, messages: [{ id: selected.id, receivedAt: selected.receivedAt, sentByOwner: false, from: selected.sender.email, to: account.label, subject: selected.subject, body: `Hi there,\n\n${selected.snippet}\n\nLet me know what you think.\n\n${selected.sender.name}`, attachments: [] }] }); return }
    setThreadLoading(true)
    readMailThread(companyId, account.id, selected.threadId).then(result => { if (canceled) return; if (result.ok) setThread(result.data); else setError(result.error) }).catch(() => { if (!canceled) setError('Could not open this conversation.') }).finally(() => { if (!canceled) setThreadLoading(false) })
    return () => { canceled = true }
  }, [selected, companyId, account, preview])
  async function archive() {
    if (!selected) return
    if (preview) { setMessages(m => m.filter(x => x.threadId !== selected.threadId)); setSelected(null); notify('Sample conversation archived'); return }
    setLoading(true)
    try { const result = await updateMailThread(companyId, account.id, selected.threadId, 'archive'); if (result.ok) { setMessages(m => m.filter(x => x.threadId !== selected.threadId)); setSelected(null); notify('Conversation archived') } else setError(result.error) } catch { setError('Could not archive this conversation.') } finally { setLoading(false) }
  }
  return <><div className="sg-mail-toolbar"><div className="sg-segmented">{[['in:inbox', 'Inbox'], ['is:unread in:inbox', 'Unread'], ['in:sent', 'Sent']].map(([value, label]) => <button key={value} onClick={() => { setFolder(value); setSelected(null) }} className={folder === value ? 'active' : ''}>{label}</button>)}</div><div className="sg-row"><button className="sg-icon-button" aria-label="Refresh inbox" disabled={loading} onClick={() => void load()}><RefreshCw size={17} className={loading ? 'sg-spin' : ''} /></button><button className="sg-button sg-primary" onClick={() => setCompose('new')}><Plus size={16} />Compose</button></div></div>{error && <div className="sg-inline-error" role="alert">{error}</div>}<div className={`sg-mail-layout ${selected ? 'has-selection' : ''}`}><section className="sg-mail-list" aria-label="Message list"><form className="sg-mail-search" onSubmit={e => { e.preventDefault(); setSearch(query) }}><Search size={16} /><input aria-label="Search Gmail" placeholder="Search mail, then press Enter" value={query} onChange={e => setQuery(e.target.value)} /></form>{messages.map(m => <button key={m.id} className={`sg-mail-row ${selected?.id === m.id ? 'selected' : ''} ${m.unread ? 'unread' : ''}`} onClick={() => setSelected(m)}><div className="sg-row sg-between"><strong>{m.sender.name ?? m.sender.email}</strong><time>{new Date(m.receivedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></div><h3>{m.subject}</h3><p>{m.snippet}</p>{m.unread && <span className="sg-unread-dot" />}</button>)}{loading && <p className="sg-mail-empty" role="status">Loading messages…</p>}{!loading && !messages.length && <p className="sg-mail-empty">No messages in this view.</p>}{next && <button className="sg-button sg-load-more" disabled={loading} onClick={() => void load(next)}>Load more</button>}</section><section className="sg-mail-thread" aria-label="Conversation">{selected ? <><div className="sg-thread-toolbar"><button className="sg-icon-button" aria-label="Back to message list" onClick={() => setSelected(null)}><ArrowLeft size={18} /></button><span className="sg-grow">Conversation</span><button className="sg-button sg-compact" disabled={loading} onClick={() => void archive()}><Archive size={15} />Archive</button><button className="sg-button sg-compact sg-primary" disabled={threadLoading || !thread} onClick={() => setCompose('reply')}><Send size={14} />Reply</button></div><div className="sg-thread-content"><h2>{selected.subject}</h2>{threadLoading && <p role="status">Opening conversation…</p>}{thread?.messages.map(m => <article key={m.id} className="sg-thread-message"><div className="sg-row"><span className="sg-person-avatar">{m.from.slice(0, 1).toUpperCase()}</span><div className="sg-grow"><strong>{m.from}</strong><small>To {m.to}</small></div><time>{new Date(m.receivedAt).toLocaleDateString()}</time></div><p>{m.body}</p>{m.attachments.length > 0 && <div className="sg-callout"><Paperclip size={15} />{m.attachments.join(', ')} — open Gmail to download attachments.</div>}</article>)}</div></> : <div className="sg-empty"><span className="sg-empty-icon"><Mail size={30} strokeWidth={1.4} /></span><h3>A conversation worth your attention.</h3><p>Select an email to read the thread, archive it, or write a reply.</p></div>}</section></div>{compose && <Compose account={account} reply={compose === 'reply' ? selected : null} onClose={() => setCompose(null)} onSent={() => { setCompose(null); setSelected(null); void load() }} />}</>
}
function Compose({ account, reply, onClose, onSent }: { account: ChannelAccount; reply: CommunicationsMessage | null; onClose: () => void; onSent: () => void }) {
  const { companyId, preview, notify } = usePlatform()
  const dialog = useRef<HTMLDialogElement>(null)
  const [to, setTo] = useState(reply?.sender.email ?? '')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(reply ? `Re: ${reply.subject.replace(/^re:\s*/i, '')}` : '')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [operationId] = useState(() => crypto.randomUUID())
  useEffect(() => { dialog.current?.showModal() }, [])
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    if (preview) { notify('Preview only: no email was sent.'); setBusy(false); return }
    try { const result = await sendMail(companyId, account.id, { operationId, to, cc, subject, body, threadId: reply?.threadId }); if (result.ok) { notify('Email sent'); onSent() } else setError(result.error) } catch { setError('Could not confirm the send. Check Gmail Sent before trying again.') } finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="sg-editor sg-mail-compose" onCancel={e => { e.preventDefault(); if (!busy) onClose() }} aria-labelledby="compose-title"><form onSubmit={submit}><header className="sg-editor-header"><div><h2 id="compose-title">{reply ? 'Write a reply' : 'New email'}</h2><p>From {account.label}</p></div><button type="button" className="sg-icon-button" aria-label="Close composer" disabled={busy} onClick={onClose}><X size={18} /></button></header><div className="sg-editor-single sg-form-fields"><label>To<input required readOnly={!!reply} value={to} onChange={e => setTo(e.target.value)} placeholder="person@example.com" /></label><label>Cc<input value={cc} onChange={e => setCc(e.target.value)} placeholder="Optional, comma-separated addresses" /></label><label>Subject<input required maxLength={300} readOnly={!!reply} value={subject} onChange={e => setSubject(e.target.value)} /></label><label>Message<textarea autoFocus={!!reply} rows={10} required value={body} onChange={e => setBody(e.target.value)} /></label><p className="sg-caption">Plain-text email. This composer does not yet save drafts or send attachments.</p>{error && <p className="sg-form-error" role="alert">{error}</p>}</div><footer className="sg-editor-footer"><button type="button" className="sg-button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="sg-button sg-primary" disabled={busy}><Send size={15} />{busy ? 'Sending…' : preview ? 'Try sending' : 'Send email'}</button></footer></form></dialog>
}
