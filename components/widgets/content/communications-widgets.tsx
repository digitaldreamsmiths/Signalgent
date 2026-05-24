'use client'

import { useCallback, useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { COMMS_MOCK } from '@/lib/widgets/mock-data'
import { useCommunicationsSnapshot } from '@/contexts/communications-snapshot-context'
import { useCompany } from '@/contexts/company-context'
import { useWidgetLiveIndicator } from '../widget-live-indicator'
import {
  archiveEmailThread,
  draftEmailReply,
  sendEmailReply,
  summarizeEmailThread,
} from '@/lib/integrations/comms/assist'
import type {
  CommunicationsMessage,
  CommunicationsSnapshot,
} from '@/lib/integrations/comms/model'

const m = COMMS_MOCK

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

function formatReceivedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function senderLabel(msg: CommunicationsMessage): string {
  return msg.sender.name?.trim() || msg.sender.email
}

// ------------------------------------------------------------
// EmailClient
// ------------------------------------------------------------

export function EmailClient() {
  const { snapshot } = useCommunicationsSnapshot()
  const { markLive } = useWidgetLiveIndicator()

  useEffect(() => {
    if (snapshot) markLive()
  }, [snapshot, markLive])

  if (snapshot && snapshot.messages.length > 0) {
    return <EmailClientLive snapshot={snapshot} />
  }
  return <EmailClientMock />
}

type AssistState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; text: string }
  | { status: 'empty' } // model returned "NONE" for draft — nothing to write
  | { status: 'error'; message: string }

type InboxFilter = 'all' | 'urgent' | 'opportunity' | 'canWait' | 'untriaged' | 'promo'

const FILTERS: { key: InboxFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: '#888' },
  { key: 'urgent', label: 'Urgent', color: '#e55' },
  { key: 'opportunity', label: 'Opportunity', color: '#5DCAA5' },
  { key: 'canWait', label: 'Can wait', color: '#1D9E75' },
  { key: 'untriaged', label: 'Untriaged', color: '#888' },
  { key: 'promo', label: 'Promo', color: '#9089b8' },
]

function matchesFilter(msg: CommunicationsMessage, filter: InboxFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'urgent':
      return msg.triagedPriority === 'urgent'
    case 'opportunity':
      return msg.triagedPriority === 'opportunity'
    case 'canWait':
      return msg.triagedPriority === 'canWait'
    case 'untriaged':
      return msg.unread && msg.triagedPriority === null && msg.tag !== 'Promo'
    case 'promo':
      return msg.tag === 'Promo'
  }
}

type ActionState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'running' }
  | { status: 'done' }
  | { status: 'error'; message: string }

function EmailClientLive({ snapshot }: { snapshot: CommunicationsSnapshot }) {
  const { refresh } = useCommunicationsSnapshot()
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [active, setActive] = useState(0)
  const allMessages = snapshot.messages
  const messages = allMessages.filter((msg) => matchesFilter(msg, filter))
  const selected = messages[Math.min(active, messages.length - 1)]
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  // Reset active selection when filter changes so we land on the first
  // message of the new view rather than retaining a stale index.
  useEffect(() => {
    setActive(0)
  }, [filter])

  const [summary, setSummary] = useState<AssistState>({ status: 'idle' })
  const [draft, setDraft] = useState<AssistState>({ status: 'idle' })
  const [replyText, setReplyText] = useState('')
  /** Tracks whether the textarea content came from the AI draft. Reset
   *  when the user starts editing. Purely a UI badge, not a constraint. */
  const [replyFromAi, setReplyFromAi] = useState(false)
  const [sendState, setSendState] = useState<ActionState>({ status: 'idle' })
  const [archiveState, setArchiveState] = useState<ActionState>({ status: 'idle' })

  const runSummarize = useCallback(async () => {
    if (!companyId || !selected) return
    setSummary({ status: 'loading' })
    const result = await summarizeEmailThread(companyId, selected.threadId)
    if (!result.ok) {
      setSummary({ status: 'error', message: result.error })
      return
    }
    if (!result.body) {
      setSummary({ status: 'error', message: 'No summary available.' })
      return
    }
    setSummary({ status: 'success', text: result.body.summary })
  }, [companyId, selected])

  // Reset assist state whenever the selected thread changes; for any
  // thread triaged as urgent or opportunity, auto-fire the summarize
  // call so the user doesn't have to click — the summary appears as
  // part of landing on the message. We deliberately don't gate on
  // `unread` because triaged-urgent threads are often re-opened for
  // reference and the user still expects context. The server-side
  // 5-min thread-fingerprint cache makes repeat visits instant and
  // bounds API spend.
  useEffect(() => {
    setSummary({ status: 'idle' })
    setDraft({ status: 'idle' })
    setReplyText('')
    setReplyFromAi(false)
    setSendState({ status: 'idle' })
    setArchiveState({ status: 'idle' })
    if (
      selected &&
      (selected.triagedPriority === 'urgent' || selected.triagedPriority === 'opportunity') &&
      companyId
    ) {
      void runSummarize()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.threadId])

  const runDraft = useCallback(async () => {
    if (!companyId || !selected) return
    setDraft({ status: 'loading' })
    setSendState({ status: 'idle' })
    const result = await draftEmailReply(companyId, selected.threadId)
    if (!result.ok) {
      setDraft({ status: 'error', message: result.error })
      return
    }
    if (!result.body) {
      setDraft({ status: 'empty' })
      return
    }
    setDraft({ status: 'success', text: result.body.draft })
    setReplyText(result.body.draft)
    setReplyFromAi(true)
  }, [companyId, selected])

  const runSend = useCallback(async () => {
    if (!companyId || !selected || !replyText.trim()) return
    setSendState({ status: 'running' })
    const result = await sendEmailReply(companyId, selected.threadId, replyText)
    if (!result.ok) {
      setSendState({ status: 'error', message: result.error })
      return
    }
    setSendState({ status: 'done' })
    setReplyText('')
    setReplyFromAi(false)
    await refresh()
  }, [companyId, selected, replyText, refresh])

  const runArchive = useCallback(async () => {
    if (!companyId || !selected) return
    setArchiveState({ status: 'running' })
    const result = await archiveEmailThread(companyId, selected.threadId)
    if (!result.ok) {
      setArchiveState({ status: 'error', message: result.error })
      return
    }
    setArchiveState({ status: 'done' })
    await refresh()
  }, [companyId, selected, refresh])

  // Keyboard shortcuts: j (next) / k (prev) / e (archive) / r (draft) /
  // ? (help). Skip when an input/textarea/contenteditable is focused so
  // we don't hijack normal typing.
  useEffect(() => {
    function isEditableTarget(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement | null
      if (!t) return false
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (t.isContentEditable) return true
      return false
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e)) return
      if (e.key === 'j') {
        e.preventDefault()
        setActive((i) => Math.min(messages.length - 1, i + 1))
      } else if (e.key === 'k') {
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
      } else if (e.key === 'e') {
        e.preventDefault()
        void runArchive()
      } else if (e.key === 'r') {
        e.preventDefault()
        void runDraft()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [messages.length, runArchive, runDraft])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: 'clamp(420px, 60vh, 660px)' }}>
      <InboxFilterBar
        filter={filter}
        onChange={setFilter}
        messages={allMessages}
      />

      {selected ? (
        <div style={{ display: 'grid', gridTemplateColumns: '38fr 62fr', gap: 8, minHeight: 0, flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', minHeight: 0 }}>
            {messages.map((msg, i) => (
              <button
                key={msg.id}
                onClick={() => setActive(i)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderLeft: i === active ? '2px solid #1D9E75' : '2px solid transparent',
                  background: i === active ? 'rgba(255,255,255,0.02)' : 'transparent',
                  borderBottom: '1px solid #272727',
                  cursor: 'pointer',
                  border: 'none',
                  display: 'block',
                  width: '100%',
                }}
              >
                <div style={{ borderLeft: i === active ? '2px solid #1D9E75' : '2px solid transparent', paddingLeft: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: msg.unread ? 600 : 500, color: '#ffffff' }}>
                      {senderLabel(msg)}
                    </span>
                    <span style={{ fontSize: 9, color: '#999999' }}>{formatReceivedAt(msg.receivedAt)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#ffffff', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.7 }}>
                    {msg.subject}
                  </div>
                  <span style={{ fontSize: 8, color: '#5DCAA5', background: '#031a12', borderRadius: 3, padding: '1px 5px', marginTop: 3, display: 'inline-block' }}>
                    {msg.tag}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minHeight: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#5DCAA5' }}>{senderLabel(selected)}</div>
            <div style={{ fontSize: 11, color: '#ffffff', lineHeight: 1.6, opacity: 0.8 }}>
              <div style={{ marginBottom: 6, fontWeight: 500, opacity: 1 }}>{selected.subject}</div>
              {selected.snippet || '(no preview available)'}
            </div>

            <AssistPanel title="Summary" state={summary} />

            <ReplyEditor
              value={replyText}
              onChange={(v) => {
                setReplyText(v)
                if (replyFromAi) setReplyFromAi(false)
                if (sendState.status !== 'idle') setSendState({ status: 'idle' })
              }}
              fromAi={replyFromAi}
              draft={draft}
            />

            <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
              <AssistButton
                label="Summarize"
                loadingLabel="Summarizing\u2026"
                state={summary}
                onClick={runSummarize}
                disabled={!companyId}
              />
              <AssistButton
                label={replyText ? 'Replace with AI draft' : 'Draft with AI'}
                loadingLabel="Drafting\u2026"
                state={draft}
                onClick={runDraft}
                disabled={!companyId}
              />
              <SendButton
                hasContent={replyText.trim().length > 0}
                state={sendState}
                onClick={runSend}
              />
              <ArchiveButton state={archiveState} onClick={runArchive} disabled={!companyId} />
              <a
                href={`https://mail.google.com/mail/u/0/#inbox/${selected.id}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 10,
                  background: 'transparent',
                  color: '#5DCAA5',
                  border: '1px solid #1D9E75',
                  borderRadius: 5,
                  padding: '4px 10px',
                  textDecoration: 'none',
                }}
              >
                Open in Gmail
              </a>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: '#555' }}>
                <kbd style={kbdStyle}>j</kbd>/<kbd style={kbdStyle}>k</kbd> nav \u00b7 <kbd style={kbdStyle}>r</kbd> draft \u00b7 <kbd style={kbdStyle}>e</kbd> archive
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 12, padding: '0 24px', textAlign: 'center' }}>
          {filter === 'untriaged' ? (
            <>
              <div style={{ marginBottom: 6, color: '#aaa' }}>No untriaged messages in this view.</div>
              <div style={{ fontSize: 10 }}>
                The Unread Summary above counts every unread email in your inbox. Triage (and this view) only run on the most recent batch returned by the Gmail snapshot — older unread emails aren&apos;t loaded here. Open them in Gmail to clear them out, or reconnect to pull a larger window.
              </div>
            </>
          ) : (
            <>No messages in this view.</>
          )}
        </div>
      )}
    </div>
  )
}

function InboxFilterBar({
  filter,
  onChange,
  messages,
}: {
  filter: InboxFilter
  onChange: (next: InboxFilter) => void
  messages: CommunicationsMessage[]
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        paddingBottom: 6,
        borderBottom: '1px solid #1a1a1a',
      }}
    >
      {FILTERS.map((f) => {
        const count = messages.filter((m) => matchesFilter(m, f.key)).length
        const active = filter === f.key
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            style={{
              fontSize: 10,
              padding: '3px 9px',
              borderRadius: 12,
              border: '1px solid',
              borderColor: active ? f.color : 'transparent',
              background: active ? `${f.color}1f` : '#161616',
              color: active ? '#fff' : '#999',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span>{f.label}</span>
            <span
              style={{
                fontSize: 9,
                color: active ? f.color : '#666',
                fontWeight: 500,
              }}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 9,
  background: '#1a1a1a',
  border: '1px solid #2a2a2a',
  borderRadius: 3,
  padding: '0px 4px',
  color: '#999',
  marginInline: 1,
}

function SendButton({
  hasContent,
  state,
  onClick,
}: {
  hasContent: boolean
  state: ActionState
  onClick: () => void
}) {
  const disabled = !hasContent && state.status === 'idle'
  let label = 'Send'
  let background = '#1D9E75'
  let color = '#fff'
  if (state.status === 'running') label = 'Sending…'
  else if (state.status === 'done') {
    label = 'Sent ✓'
    background = '#0F6E56'
  } else if (state.status === 'error') {
    label = 'Send failed'
    background = '#3a1a1a'
    color = '#e88'
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || state.status === 'running' || state.status === 'done'}
      title={
        state.status === 'error'
          ? state.message
          : hasContent
            ? 'Send the reply'
            : 'Write or draft a reply first'
      }
      style={{
        fontSize: 10,
        background: disabled ? '#161616' : background,
        color: disabled ? '#555' : color,
        border: 'none',
        borderRadius: 5,
        padding: '4px 10px',
        cursor: disabled || state.status === 'running' || state.status === 'done' ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function ReplyEditor({
  value,
  onChange,
  fromAi,
  draft,
}: {
  value: string
  onChange: (next: string) => void
  fromAi: boolean
  draft: AssistState
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, color: '#999' }}>Your reply</div>
        <div style={{ fontSize: 9, color: '#666', minHeight: 12 }}>
          {draft.status === 'loading' && 'Drafting with AI…'}
          {draft.status === 'empty' && 'AI thought no reply was needed — write your own if you disagree.'}
          {draft.status === 'error' && (
            <span style={{ color: '#c88' }}>Draft failed: {draft.message}</span>
          )}
          {draft.status === 'success' && fromAi && value && 'AI-drafted — feel free to edit'}
          {draft.status === 'success' && !fromAi && 'Edited from AI draft'}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a reply, or click &ldquo;Draft with AI&rdquo; to start from a model-generated draft you can edit."
        rows={6}
        style={{
          width: '100%',
          fontSize: 11,
          lineHeight: 1.5,
          color: '#fff',
          background: '#0c1612',
          border: `1px solid ${fromAi && value ? '#1D9E75' : '#1f1f1f'}`,
          borderRadius: 6,
          padding: '8px 10px',
          fontFamily: 'inherit',
          resize: 'vertical',
          minHeight: 80,
          outline: 'none',
        }}
      />
    </div>
  )
}

function ArchiveButton({
  state,
  onClick,
  disabled,
}: {
  state: ActionState
  onClick: () => void
  disabled?: boolean
}) {
  let label = 'Archive'
  if (state.status === 'running') label = 'Archiving…'
  else if (state.status === 'done') label = 'Archived'
  else if (state.status === 'error') label = 'Archive failed'
  return (
    <button
      onClick={onClick}
      disabled={disabled || state.status === 'running' || state.status === 'done'}
      title={state.status === 'error' ? state.message : 'Remove from inbox'}
      style={{
        fontSize: 10,
        background: 'transparent',
        color: state.status === 'error' ? '#e88' : '#999',
        border: `1px solid ${state.status === 'error' ? '#3a2222' : '#2a2a2a'}`,
        borderRadius: 5,
        padding: '4px 10px',
        cursor: disabled || state.status === 'running' || state.status === 'done' ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function AssistButton({
  label,
  loadingLabel,
  state,
  onClick,
  disabled,
}: {
  label: string
  loadingLabel: string
  state: AssistState
  onClick: () => void
  disabled?: boolean
}) {
  const loading = state.status === 'loading'
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        fontSize: 10,
        background: '#1a1a1a',
        color: loading ? '#777' : '#e9e9e9',
        border: '1px solid #2a2a2a',
        borderRadius: 5,
        padding: '4px 10px',
        cursor: disabled || loading ? 'default' : 'pointer',
      }}
    >
      {loading ? loadingLabel : label}
    </button>
  )
}

function AssistPanel({
  title,
  state,
  copyable,
}: {
  title: string
  state: AssistState
  copyable?: boolean
}) {
  if (state.status === 'idle') return null
  const isError = state.status === 'error'
  const isEmpty = state.status === 'empty'
  const isLoading = state.status === 'loading'
  const text =
    state.status === 'success'
      ? state.text
      : isError
      ? state.message
      : isEmpty
      ? 'Nothing to reply to here \u2014 the thread is promotional or already handled.'
      : 'Thinking\u2026'
  return (
    <div
      style={{
        background: isError ? '#1f0f0f' : '#031a12',
        border: `1px solid ${isError ? '#3a1515' : '#082e1e'}`,
        borderRadius: 6,
        padding: '8px 10px',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 500,
          color: isError ? '#ef7b7b' : '#5DCAA5',
          marginBottom: 4,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{title}</span>
        {copyable && state.status === 'success' ? (
          <button
            onClick={() => navigator.clipboard?.writeText(state.text)}
            style={{
              fontSize: 9,
              background: 'transparent',
              color: '#5DCAA5',
              border: '1px solid #0f3a26',
              borderRadius: 4,
              padding: '1px 6px',
              cursor: 'pointer',
            }}
          >
            Copy
          </button>
        ) : null}
      </div>
      <div
        style={{
          fontSize: 10,
          color: '#ffffff',
          opacity: isLoading ? 0.6 : 0.85,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.55,
        }}
      >
        {text}
      </div>
    </div>
  )
}

function EmailClientMock() {
  const [active, setActive] = useState(0)
  const selected = m.emails[active]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, height: 'clamp(360px, 56vh, 600px)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', minHeight: 0 }}>
        {m.emails.map((email, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              textAlign: 'left',
              padding: '8px 10px',
              borderLeft: i === active ? '2px solid #1D9E75' : '2px solid transparent',
              background: i === active ? 'rgba(255,255,255,0.02)' : 'transparent',
              borderBottom: '1px solid #272727',
              cursor: 'pointer',
              border: 'none',
              display: 'block',
              width: '100%',
            }}
          >
            <div style={{ borderLeft: i === active ? '2px solid #1D9E75' : '2px solid transparent', paddingLeft: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#ffffff' }}>{email.sender}</span>
                <span style={{ fontSize: 9, color: '#999999' }}>{email.time}</span>
              </div>
              <div style={{ fontSize: 10, color: '#ffffff', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.7 }}>
                {email.subject}
              </div>
              <span style={{ fontSize: 8, color: '#5DCAA5', background: '#031a12', borderRadius: 3, padding: '1px 5px', marginTop: 3, display: 'inline-block' }}>
                {email.tag}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#5DCAA5' }}>{selected.sender}</div>
        <div style={{ fontSize: 11, color: '#ffffff', lineHeight: 1.6, opacity: 0.8 }}>
          {selected.subject}. The full thread would appear here once connected.
        </div>
        <div style={{ background: '#031a12', border: '1px solid #082e1e', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 500, color: '#5DCAA5', marginBottom: 4 }}>AI suggestion</div>
          <div style={{ fontSize: 10, color: '#ffffff', opacity: 0.7 }}>This message appears to need a response within 24 hours.</div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
          <button style={{ fontSize: 10, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}>Reply</button>
          <button style={{ fontSize: 10, background: '#1a1a1a', color: '#999999', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}>Archive</button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// ResponseStats
// ------------------------------------------------------------

export function ResponseStats() {
  const { snapshot } = useCommunicationsSnapshot()
  const { markLive } = useWidgetLiveIndicator()

  useEffect(() => {
    if (snapshot) markLive()
  }, [snapshot, markLive])

  // All four stats resolve to live data when the snapshot is present; any
  // field that returns null (traversal failed, empty sample) falls back to
  // the mock value so the widget never renders a blank cell.
  const stats = [
    {
      label: 'Response rate',
      value: snapshot?.responseRate != null ? `${snapshot.responseRate}%` : m.responseRate,
    },
    {
      label: 'Avg reply time',
      value:
        snapshot?.avgResponseTimeHours != null
          ? `${snapshot.avgResponseTimeHours.toFixed(1)}h`
          : m.avgResponseTime,
    },
    {
      label: 'Total unread',
      value: snapshot != null ? String(snapshot.totalUnread) : String(m.totalUnread),
    },
    {
      label: 'Threads active',
      value: snapshot != null ? String(snapshot.threadsActive) : '18',
    },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {stats.map((s) => (
        <div key={s.label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#666666', marginBottom: 4 }}>{s.label}</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: '#5DCAA5' }}>{s.value}</div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// UnreadSummary
//
// Phase-1 redesign: full-width widget that consolidates the prior
// UnreadSummary + PriorityBreakdown duplication. Shows the headline
// total + a horizontal stacked proportion bar + per-bucket counts
// INCLUDING the previously-invisible "Untriaged" bucket (unread
// messages that haven't received an LLM triage label yet — typically
// the majority of a 200-msg inbox).
// ------------------------------------------------------------

export function UnreadSummary() {
  const { snapshot } = useCommunicationsSnapshot()
  const { markLive } = useWidgetLiveIndicator()

  useEffect(() => {
    if (snapshot) markLive()
  }, [snapshot, markLive])

  const totalUnread = snapshot != null ? snapshot.totalUnread : m.totalUnread
  const breakdown = snapshot?.priorityBreakdown
  const urgent = breakdown != null ? breakdown.urgent : m.urgentCount
  const opportunity = breakdown != null ? breakdown.opportunity : m.opportunityCount
  const canWait = breakdown != null ? breakdown.canWait : m.canWaitCount
  // Promo count = unread messages tagged 'Promo' (Gmail CATEGORY_PROMOTIONS).
  const promo =
    snapshot != null
      ? snapshot.messages.filter((msg) => msg.unread && msg.tag === 'Promo').length
      : 0
  // Untriaged = unread messages without a triagedPriority and not promo.
  // For mock, derive a plausible "everything else" number.
  const triagedTotal = urgent + opportunity + canWait
  const untriaged =
    snapshot != null
      ? Math.max(0, totalUnread - triagedTotal - promo)
      : Math.max(0, m.totalUnread - triagedTotal)

  const buckets = [
    { key: 'urgent', label: 'Urgent', count: urgent, color: '#e55' },
    { key: 'opportunity', label: 'Opportunity', count: opportunity, color: '#5DCAA5' },
    { key: 'canWait', label: 'Can wait', count: canWait, color: '#1D9E75' },
    { key: 'untriaged', label: 'Untriaged', count: untriaged, color: '#444' },
    { key: 'promo', label: 'Promo', count: promo, color: '#3a2e6e' },
  ]
  const denom = Math.max(1, buckets.reduce((acc, b) => acc + b.count, 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 28, fontWeight: 500, color: '#5DCAA5' }}>{totalUnread}</span>
        <span style={{ fontSize: 12, color: '#999' }}>unread across {snapshot?.threadsActive ?? '—'} threads</span>
      </div>

      {/* Horizontal stacked bar */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 10,
          borderRadius: 6,
          overflow: 'hidden',
          background: '#1a1a1a',
        }}
      >
        {buckets.map((b) =>
          b.count > 0 ? (
            <div
              key={b.key}
              style={{
                width: `${(b.count / denom) * 100}%`,
                background: b.color,
              }}
              title={`${b.label}: ${b.count}`}
            />
          ) : null
        )}
      </div>

      {/* Per-bucket counts as a horizontal legend row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 8,
        }}
      >
        {buckets.map((b) => (
          <div key={b.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#999' }}>{b.label}</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 500, color: '#fff' }}>{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// PriorityBreakdown
// ------------------------------------------------------------

export function PriorityBreakdown() {
  const { snapshot } = useCommunicationsSnapshot()
  const { markLive } = useWidgetLiveIndicator()

  useEffect(() => {
    if (snapshot?.priorityBreakdown) markLive()
  }, [snapshot, markLive])

  const source = snapshot?.priorityBreakdown ?? m.priorityBreakdown
  const data = [
    { name: 'Urgent', value: source.urgent },
    { name: 'Opportunity', value: source.opportunity },
    { name: 'Can wait', value: source.canWait },
  ]
  const COLORS = ['#1D9E75', '#5DCAA5', '#0F6E56']
  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" animationDuration={400}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 4 }}>
        {data.map((d, i) => (
          <span key={d.name} style={{ fontSize: 9, color: COLORS[i] }}>{d.name} ({d.value})</span>
        ))}
      </div>
    </div>
  )
}
