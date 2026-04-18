'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { COMMS_MOCK } from '@/lib/widgets/mock-data'

const m = COMMS_MOCK

export function EmailClient() {
  const [active, setActive] = useState(0)
  const selected = m.emails[active]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minHeight: 220 }}>
      {/* Email list */}
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

      {/* Preview */}
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

export function ResponseStats() {
  const stats = [
    { label: 'Response rate', value: m.responseRate },
    { label: 'Avg reply time', value: m.avgResponseTime },
    { label: 'Total unread', value: String(m.totalUnread) },
    { label: 'Threads active', value: '18' },
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

export function UnreadSummary() {
  const items = [
    { label: 'Urgent', count: m.urgentCount, color: '#e55' },
    { label: 'Opportunity', count: m.opportunityCount, color: '#5DCAA5' },
    { label: 'Can wait', count: m.canWaitCount, color: '#666666' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 20, fontWeight: 500, color: '#5DCAA5', marginBottom: 4 }}>{m.totalUnread} unread</div>
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

export function PriorityBreakdown() {
  const data = [
    { name: 'Urgent', value: m.priorityBreakdown.urgent },
    { name: 'Opportunity', value: m.priorityBreakdown.opportunity },
    { name: 'Can wait', value: m.priorityBreakdown.canWait },
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
