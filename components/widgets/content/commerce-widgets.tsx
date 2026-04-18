'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { COMMERCE_MOCK } from '@/lib/widgets/mock-data'

const c = COMMERCE_MOCK

export function OrderStats() {
  const stats = [
    { label: 'Total Orders', value: String(c.totalOrders) },
    { label: 'Revenue', value: c.totalRevenue },
    { label: 'Fulfillment', value: c.fulfillmentRate },
    { label: 'New', value: String(c.newOrders) },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {stats.map((s) => (
        <div key={s.label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#666666', marginBottom: 4 }}>{s.label}</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: '#85B7EB' }}>{s.value}</div>
        </div>
      ))}
    </div>
  )
}

export function Products() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {c.products.map((p) => (
        <div key={p.name} style={{ background: '#1a1a1a', border: '1px solid #272727', borderRadius: 8, padding: 10 }}>
          <div style={{ height: 30, background: 'rgba(255,255,255,0.03)', borderRadius: 4, marginBottom: 6 }} />
          <div style={{ fontSize: 11, color: '#ffffff' }}>{p.name}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#378ADD' }}>{p.price}</span>
            <span style={{ fontSize: 9, color: p.stock < 10 ? '#e55' : '#999999' }}>{p.stock} in stock</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function OrdersKanban() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {Object.entries(c.orders).map(([status, orders]) => (
        <div key={status}>
          <div style={{ fontSize: 10, color: '#666666', marginBottom: 6, textTransform: 'capitalize' }}>{status}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {orders.map((o) => (
              <div key={o.id} style={{ background: '#1a1a1a', border: '1px solid #272727', borderRadius: 6, padding: '6px 8px' }}>
                <div style={{ fontSize: 10, color: '#ffffff' }}>{o.id}</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#378ADD', marginTop: 2 }}>{o.amount}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function RecentActivity() {
  const typeColors: Record<string, string> = { order: '#378ADD', shipped: '#6a6', alert: '#e55', processing: '#85B7EB', refund: '#a66' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {c.recentActivity.map((a, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #272727' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: typeColors[a.type] || '#333', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#ffffff' }}>{a.event}</div>
            <div style={{ fontSize: 10, color: '#999999', marginTop: 1 }}>{a.detail}</div>
          </div>
          <span style={{ fontSize: 9, color: '#999999', flexShrink: 0 }}>{a.time}</span>
        </div>
      ))}
    </div>
  )
}

export function LowStock() {
  const lowItems = c.products.filter((p) => p.stock < 20)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lowItems.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: '#1a1a1a', borderRadius: 6, border: '1px solid #272727' }}>
          <div>
            <div style={{ fontSize: 11, color: '#ffffff' }}>{p.name}</div>
            <div style={{ fontSize: 10, color: '#999999', marginTop: 1 }}>{p.price}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: p.stock < 10 ? '#e55' : '#EF9F27' }}>{p.stock}</div>
            <div style={{ fontSize: 9, color: '#999999' }}>remaining</div>
          </div>
        </div>
      ))}
      {lowItems.length === 0 && <div style={{ fontSize: 11, color: '#999999' }}>All products well stocked.</div>}
    </div>
  )
}

export function RevenueByProduct() {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={c.revenueByProduct} layout="vertical">
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 9, fill: '#ffffff' }} axisLine={false} tickLine={false} width={80} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} formatter={(value) => [`$${Number(value).toLocaleString()}`]} />
        <Bar dataKey="value" fill="#0C447C" radius={[0, 3, 3, 0]} animationDuration={400}>
          {c.revenueByProduct.map((_, i) => <Cell key={i} fill={i === 0 ? '#378ADD' : '#0C447C'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
