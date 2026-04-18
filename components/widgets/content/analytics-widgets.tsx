'use client'

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { ANALYTICS_MOCK } from '@/lib/widgets/mock-data'

const a = ANALYTICS_MOCK

export function TrafficChart() {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={a.trafficBars}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} animationDuration={400}>
          {a.trafficBars.map((_, i) => <Cell key={i} fill={i === a.trafficBars.length - 1 ? '#639922' : '#173404'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function EngagementChart() {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={a.engagementBars}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} animationDuration={400}>
          {a.engagementBars.map((_, i) => <Cell key={i} fill={i === a.engagementBars.length - 1 ? '#639922' : '#173404'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function PerformanceTable() {
  const rows = [
    { metric: 'Total visits', thisWeek: a.totalTraffic, lastWeek: '6,490', change: a.trafficChange },
    { metric: 'Conversion rate', thisWeek: a.conversionRate, lastWeek: '3.4%', change: a.conversionChange },
    { metric: 'Bounce rate', thisWeek: a.bounceRate, lastWeek: '45%', change: '-3%' },
    { metric: 'Avg session', thisWeek: a.avgSession, lastWeek: '1m 58s', change: '+16s' },
  ]
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, paddingBottom: 8, borderBottom: '1px solid #272727', fontSize: 10, color: '#666666' }}>
        <span>Metric</span><span>This week</span><span>Last week</span><span>Change</span>
      </div>
      {rows.map((r) => (
        <div key={r.metric} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid #272727', fontSize: 11 }}>
          <span style={{ color: '#ffffff' }}>{r.metric}</span>
          <span style={{ color: '#ffffff' }}>{r.thisWeek}</span>
          <span style={{ color: '#999999' }}>{r.lastWeek}</span>
          <span style={{ color: r.change.startsWith('+') ? '#6a6' : r.change.startsWith('-') ? '#a66' : '#999999' }}>{r.change}</span>
        </div>
      ))}
    </div>
  )
}

export function TopPages() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {a.topPages.map((p) => (
        <div key={p.path}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: '#ffffff' }}>{p.path}</span>
            <span style={{ fontSize: 10, color: '#999999' }}>{p.views.toLocaleString()}</span>
          </div>
          <div style={{ height: 4, background: '#272727', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${p.pct}%`, background: '#639922', borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ConversionStats() {
  const stats = [
    { label: 'Conversion rate', value: a.conversionRate, change: a.conversionChange },
    { label: 'Bounce rate', value: a.bounceRate, change: '-3%' },
    { label: 'Avg session', value: a.avgSession, change: '+16s' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {stats.map((s) => (
        <div key={s.label}>
          <div style={{ fontSize: 10, color: '#666666', marginBottom: 3 }}>{s.label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 500, color: '#97C459' }}>{s.value}</span>
            <span style={{ fontSize: 10, color: s.change.startsWith('+') ? '#6a6' : s.change.startsWith('-') ? '#a66' : '#999999' }}>{s.change}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function BounceRate() {
  const data = a.bounceTrend.map((v, i) => ({ day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], rate: v }))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} domain={[35, 55]} unit="%" />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} formatter={(value) => [`${value}%`]} />
        <Line type="monotone" dataKey="rate" stroke="#97C459" strokeWidth={2} dot={{ fill: '#97C459', r: 3 }} animationDuration={400} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function ReferralSources() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={a.referralSources} layout="vertical">
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis dataKey="source" type="category" tick={{ fontSize: 9, fill: '#ffffff' }} axisLine={false} tickLine={false} width={90} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} />
        <Bar dataKey="value" fill="#173404" radius={[0, 3, 3, 0]} animationDuration={400}>
          {a.referralSources.map((_, i) => <Cell key={i} fill={i === 0 ? '#639922' : '#173404'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
