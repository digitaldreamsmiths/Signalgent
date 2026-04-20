'use client'

import { useEffect } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import { ANALYTICS_MOCK } from '@/lib/widgets/mock-data'
import { useAnalyticsSnapshot } from '@/contexts/analytics-snapshot-context'
import { useWidgetLiveIndicator } from '../widget-live-indicator'
import type { AnalyticsSnapshot } from '@/lib/integrations/analytics/model'

const a = ANALYTICS_MOCK

/**
 * Shared hook: pull the analytics snapshot, flip the widget's live
 * indicator when present. Returns null for mock widgets to keep their
 * existing render path.
 */
function useLiveSnapshot(): AnalyticsSnapshot | null {
  const { snapshot } = useAnalyticsSnapshot()
  const { markLive } = useWidgetLiveIndicator()
  useEffect(() => {
    if (snapshot) markLive()
  }, [snapshot, markLive])
  return snapshot
}

export function TrafficChart() {
  const snapshot = useLiveSnapshot()
  const data = snapshot?.trafficBars ?? a.trafficBars
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} animationDuration={400}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === data.length - 1 ? '#639922' : '#173404'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function EngagementChart() {
  const snapshot = useLiveSnapshot()
  const data = snapshot?.engagementBars ?? a.engagementBars
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} animationDuration={400}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === data.length - 1 ? '#639922' : '#173404'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function PerformanceTable() {
  const snapshot = useLiveSnapshot()
  const rows = snapshot
    ? [
        { metric: 'Total visits',    thisWeek: snapshot.totalTraffic.value,   lastWeek: snapshot.totalTraffic.previous,   change: snapshot.totalTraffic.change },
        { metric: 'Conversion rate', thisWeek: snapshot.conversionRate.value, lastWeek: snapshot.conversionRate.previous, change: snapshot.conversionRate.change },
        { metric: 'Bounce rate',     thisWeek: snapshot.bounceRate.value,     lastWeek: snapshot.bounceRate.previous,     change: snapshot.bounceRate.change },
        { metric: 'Avg session',     thisWeek: snapshot.avgSession.value,     lastWeek: snapshot.avgSession.previous,     change: snapshot.avgSession.change },
      ]
    : [
        { metric: 'Total visits',    thisWeek: a.totalTraffic,    lastWeek: '6,490',   change: a.trafficChange },
        { metric: 'Conversion rate', thisWeek: a.conversionRate,  lastWeek: '3.4%',    change: a.conversionChange },
        { metric: 'Bounce rate',     thisWeek: a.bounceRate,      lastWeek: '45%',     change: '-3%' },
        { metric: 'Avg session',     thisWeek: a.avgSession,      lastWeek: '1m 58s',  change: '+16s' },
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
  const snapshot = useLiveSnapshot()
  const pages = snapshot?.topPages ?? a.topPages
  if (pages.length === 0) {
    return (
      <div style={{ fontSize: 11, color: '#999', padding: '8px 0' }}>
        No page data in the last 7 days.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pages.map((p) => (
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
  const snapshot = useLiveSnapshot()
  const stats = snapshot
    ? [
        { label: 'Conversion rate', value: snapshot.conversionRate.value, change: snapshot.conversionRate.change },
        { label: 'Bounce rate',     value: snapshot.bounceRate.value,     change: snapshot.bounceRate.change },
        { label: 'Avg session',     value: snapshot.avgSession.value,     change: snapshot.avgSession.change },
      ]
    : [
        { label: 'Conversion rate', value: a.conversionRate, change: a.conversionChange },
        { label: 'Bounce rate',     value: a.bounceRate,     change: '-3%' },
        { label: 'Avg session',     value: a.avgSession,     change: '+16s' },
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
  const snapshot = useLiveSnapshot()
  const data = snapshot
    ? snapshot.bounceTrend
    : a.bounceTrend.map((v, i) => ({ day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], rate: v }))
  // Widen the domain a touch in either direction so the line doesn't hit the edges.
  const rates = data.map((d) => d.rate)
  const minR = Math.max(0, Math.floor(Math.min(...rates) - 5))
  const maxR = Math.min(100, Math.ceil(Math.max(...rates) + 5))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} domain={[minR, maxR]} unit="%" />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} formatter={(value) => [`${value}%`]} />
        <Line type="monotone" dataKey="rate" stroke="#97C459" strokeWidth={2} dot={{ fill: '#97C459', r: 3 }} animationDuration={400} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function ReferralSources() {
  const snapshot = useLiveSnapshot()
  const data = snapshot?.referralSources ?? a.referralSources
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis dataKey="source" type="category" tick={{ fontSize: 9, fill: '#ffffff' }} axisLine={false} tickLine={false} width={90} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} />
        <Bar dataKey="value" fill="#173404" radius={[0, 3, 3, 0]} animationDuration={400}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === 0 ? '#639922' : '#173404'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
