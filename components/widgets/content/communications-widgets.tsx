'use client'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { COMMS_MOCK } from '@/lib/widgets/mock-data'
import { useCommunicationsSnapshot } from '@/contexts/communications-snapshot-context'
import { useWidgetLiveIndicator } from '../widget-live-indicator'
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

function EmailClientLive({ snapshot }: { snapshot: CommunicationsSnapshot }) {
  const [active, setActive] = useState(0)
  const messages = snapshot.messages
  const selected = messages[Math.min(active, messages.length - 1)]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minHeight: 220 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
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

      <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#5DCAA5' }}>{senderLabel(selected)}</div>
        <div style={{ fontSize: 11, color: '#ffffff', lineHeight: 1.6, opacity: 0.8 }}>
          <div style={{ marginBottom: 6, fontWeight: 500, opacity: 1 }}>{selected.subject}</div>
          {selected.snippet || '(no preview available)'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
          <a
            href={`https://mail.google.com/mail/u/0/#inbox/${selected.id}`}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 10,
              background: '#1D9E75',
              color: '#fff',
              border: 'none',
              borderRadius: 5,
              padding: '4px 10px',
              textDecoration: 'none',
            }}
          >
            Open in Gmail
          </a>
        </div>
      </div>
    </div>
  )
}

function EmailClientMock() {
  const [active, setActive] = useState(0)
  const selected = m.emails[active]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minHeight: 220 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
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

      <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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

  // Response rate + avg reply time aren't computed yet (null in v1 snapshot).
  // Fall back to mock for those; keep totalUnread and threadsActive live.
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
// ------------------------------------------------------------

export function UnreadSummary() {
  const { snapshot } = useCommunicationsSnapshot()
  const { markLive } = useWidgetLiveIndicator()

  useEffect(() => {
    if (snapshot) markLive()
  }, [snapshot, markLive])

  const totalUnread = snapshot != null ? snapshot.totalUnread : m.totalUnread
  // Buckets reflect the LLM-triaged recent messages when triage ran; fall
  // back to mock counts otherwise.
  const breakdown = snapshot?.priorityBreakdown
  const items = [
    {
      label: 'Urgent',
      count: breakdown != null ? breakdown.urgent : m.urgentCount,
      color: '#e55',
    },
    {
      label: 'Opportunity',
      count: breakdown != null ? breakdown.opportunity : m.opportunityCount,
      color: '#5DCAA5',
    },
    {
      label: 'Can wait',
      count: breakdown != null ? breakdown.canWait : m.canWaitCount,
      color: '#666666',
    },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 20, fontWeight: 500, color: '#5DCAA5', marginBottom: 4 }}>{totalUnread} unread</div>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#ffffff', flex: 1 }}>{item.label}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#ffffff' }}>{item.count}</span>
        </div>
      ))}
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
