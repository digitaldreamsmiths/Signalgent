'use client'

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { MARKETING_MOCK } from '@/lib/widgets/mock-data'

const m = MARKETING_MOCK
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function MarketingKpiRow() {
  const kpis = [
    { label: 'Scheduled', value: m.scheduledPosts },
    { label: 'Published', value: m.publishedPosts },
    { label: 'Avg Reach', value: m.avgReach.toLocaleString() },
    { label: 'Engagement', value: m.engagementRate },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {kpis.map((k) => (
        <div key={k.label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#666666', marginBottom: 4 }}>{k.label}</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: '#F0997B' }}>{k.value}</div>
        </div>
      ))}
    </div>
  )
}

export function ContentCalendar() {
  const posts: Record<number, string[]> = { 2: ['LinkedIn · 10am'], 4: ['Facebook · 2pm'] }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {DAYS.map((day, i) => (
          <div key={day}>
            <div style={{ fontSize: 10, color: '#666666', textAlign: 'center', marginBottom: 6 }}>{day}</div>
            <div style={{ minHeight: 50, background: 'rgba(255,255,255,0.015)', border: '1px solid #272727', borderRadius: 5, padding: 5, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {posts[i]?.map((p) => (
                <span key={p} style={{ fontSize: 9, color: '#F0997B', background: 'rgba(216,90,48,0.15)', borderRadius: 3, padding: '2px 5px' }}>{p}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RecentPosts() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {m.recentPosts.slice(0, 5).map((post, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #272727' }}>
          <span style={{ fontSize: 9, color: '#999999', width: 60, flexShrink: 0 }}>{post.platform}</span>
          <span style={{ fontSize: 11, color: '#ffffff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.preview}</span>
          <span style={{ fontSize: 9, color: post.status === 'Published' ? '#6a6' : post.status === 'Scheduled' ? '#F0997B' : '#999999', flexShrink: 0 }}>{post.status}</span>
          <span style={{ fontSize: 9, color: '#999999', width: 70, textAlign: 'right', flexShrink: 0 }}>{post.time}</span>
        </div>
      ))}
    </div>
  )
}

export function PlatformBreakdown() {
  const data = [
    { name: 'LinkedIn', value: m.platformBreakdown.linkedin },
    { name: 'Facebook', value: m.platformBreakdown.facebook },
  ]
  const COLORS = ['#D85A30', '#F0997B']
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
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
        {data.map((d, i) => (
          <span key={d.name} style={{ fontSize: 10, color: COLORS[i] }}>{d.name} {d.value}%</span>
        ))}
      </div>
    </div>
  )
}

export function EngagementTrend() {
  const data = m.engagementTrend.map((v, i) => ({ day: DAYS[i], rate: v }))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} domain={[2, 5]} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} />
        <Line type="monotone" dataKey="rate" stroke="#F0997B" strokeWidth={2} dot={{ fill: '#F0997B', r: 3 }} animationDuration={400} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function TopPost() {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#999999', marginBottom: 6 }}>{m.topPost.platform}</div>
      <div style={{ fontSize: 12, color: '#ffffff', lineHeight: 1.5, marginBottom: 12 }}>{m.topPost.preview}</div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div style={{ fontSize: 9, color: '#666666' }}>Reach</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#F0997B' }}>{m.topPost.reach.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#666666' }}>Engagement</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: '#F0997B' }}>{m.topPost.engagement}</div>
        </div>
      </div>
    </div>
  )
}

export function PostFrequency() {
  const data = m.postFrequency.map((v, i) => ({ week: `W${i + 1}`, posts: v }))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} />
        <Bar dataKey="posts" fill="#712B13" radius={[3, 3, 0, 0]} animationDuration={400}>
          {data.map((_, i) => <Cell key={i} fill={i === data.length - 1 ? '#D85A30' : '#712B13'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
