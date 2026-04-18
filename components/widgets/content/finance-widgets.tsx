'use client'

import { useEffect } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { FINANCE_MOCK } from '@/lib/widgets/mock-data'
import { useFinanceSnapshot } from '@/contexts/finance-snapshot-context'
import { useWidgetLiveIndicator } from '../widget-live-indicator'
import type { FinanceKpi, FinanceSnapshot } from '@/lib/integrations/finance/model'

const f = FINANCE_MOCK

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

function formatCurrency(value: number | null, currency: string): string {
  if (value === null) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `$${Math.round(value).toLocaleString()}`
  }
}

function formatChange(kpi: FinanceKpi): string {
  if (kpi.changePercent === null) return '—'
  const sign = kpi.changePercent > 0 ? '+' : ''
  return `${sign}${kpi.changePercent}%`
}

// ------------------------------------------------------------
// FinanceKpiRow
// ------------------------------------------------------------

export function FinanceKpiRow() {
  const { snapshot, isLive } = useFinanceSnapshot()
  const { markLive } = useWidgetLiveIndicator()

  useEffect(() => {
    if (isLive) markLive()
  }, [isLive, markLive])

  if (snapshot) return <FinanceKpiRowLive snapshot={snapshot} />
  return <FinanceKpiRowMock />
}

function FinanceKpiRowLive({ snapshot }: { snapshot: FinanceSnapshot }) {
  const c = snapshot.currency
  const kpis = [
    { label: 'Revenue 30d', kpi: snapshot.kpis.revenue },
    { label: 'Expenses', kpi: snapshot.kpis.expenses },
    { label: 'Net Profit', kpi: snapshot.kpis.netProfit },
    { label: 'MRR', kpi: snapshot.kpis.mrr },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {kpis.map(({ label, kpi }) => {
        const change = formatChange(kpi)
        const changeColor =
          kpi.changePercent === null
            ? '#666'
            : kpi.changePercent >= 0
              ? '#6a6'
              : '#a66'
        return (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#666666', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 500, color: '#EF9F27' }}>
              {formatCurrency(kpi.value, c)}
            </div>
            <div style={{ fontSize: 10, color: changeColor, marginTop: 2 }}>{change}</div>
          </div>
        )
      })}
    </div>
  )
}

function FinanceKpiRowMock() {
  const kpis = [
    { label: 'Revenue 30d', value: f.revenue30d, change: f.revenueChange },
    { label: 'Expenses', value: f.expenses30d, change: f.expensesChange },
    { label: 'Net Profit', value: f.netProfit, change: f.profitChange },
    { label: 'MRR', value: f.mrr, change: f.mrrChange },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {kpis.map((k) => (
        <div key={k.label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#666666', marginBottom: 4 }}>{k.label}</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: '#EF9F27' }}>{k.value}</div>
          <div style={{ fontSize: 10, color: k.change.startsWith('+') ? '#6a6' : '#a66', marginTop: 2 }}>{k.change}</div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// RevenueChart
// ------------------------------------------------------------

export function RevenueChart() {
  const { snapshot, isLive } = useFinanceSnapshot()
  const { markLive } = useWidgetLiveIndicator()

  useEffect(() => {
    if (isLive) markLive()
  }, [isLive, markLive])

  const data = snapshot
    ? snapshot.revenueByWeek.map((p, i) => ({ week: `W${i + 1}`, revenue: p.amount }))
    : f.revenueBars.map((v, i) => ({ week: `W${i + 1}`, revenue: v }))

  const currency = snapshot?.currency ?? 'USD'

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }}
          formatter={(value) => [formatCurrency(Number(value), currency), 'Revenue']}
        />
        <Bar dataKey="revenue" barSize={44} radius={[3, 3, 0, 0]} animationDuration={400}>
          {data.map((_, i) => <Cell key={i} fill={i === data.length - 1 ? '#EF9F27' : '#412402'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ------------------------------------------------------------
// RecentTransactions
// ------------------------------------------------------------

export function RecentTransactions() {
  const { snapshot, isLive } = useFinanceSnapshot()
  const { markLive } = useWidgetLiveIndicator()

  useEffect(() => {
    if (isLive) markLive()
  }, [isLive, markLive])

  if (snapshot) return <RecentTransactionsLive snapshot={snapshot} />
  return <RecentTransactionsMock />
}

function RecentTransactionsLive({ snapshot }: { snapshot: FinanceSnapshot }) {
  const rows = snapshot.transactions.slice(0, 8)
  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 11, color: '#666', textAlign: 'center', padding: '20px 0' }}>
        No transactions in the last 70 days.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {rows.map((tx) => {
        const isInflow = tx.amount > 0
        const sign = isInflow ? '+' : ''
        const amountStr = `${sign}${formatCurrency(tx.amount, tx.currency)}`
        const date = new Date(tx.occurredAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
        return (
          <div
            key={tx.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 0',
              borderBottom: '1px solid #272727',
            }}
          >
            <span style={{ fontSize: 11, color: '#ffffff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tx.description}
            </span>
            <span style={{ fontSize: 9, color: '#999999', width: 80, textTransform: 'capitalize' }}>
              {tx.category}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: isInflow ? '#6a6' : '#a66',
                width: 90,
                textAlign: 'right',
              }}
            >
              {amountStr}
            </span>
            <span style={{ fontSize: 9, color: '#999999', width: 50, textAlign: 'right' }}>{date}</span>
          </div>
        )
      })}
    </div>
  )
}

function RecentTransactionsMock() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {f.transactions.map((tx, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #272727' }}>
          <span style={{ fontSize: 11, color: '#ffffff', flex: 1 }}>{tx.description}</span>
          <span style={{ fontSize: 9, color: '#999999', width: 80 }}>{tx.category}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: tx.amount.startsWith('+') ? '#6a6' : '#a66', width: 80, textAlign: 'right' }}>{tx.amount}</span>
          <span style={{ fontSize: 9, color: '#999999', width: 50, textAlign: 'right' }}>{tx.date}</span>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// ExpenseBreakdown — mock-only by design (Stripe isn't an expense source)
// ------------------------------------------------------------

export function ExpenseBreakdown() {
  const COLORS = ['#EF9F27', '#BA7517', '#6a5010', '#3a2a00']
  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={f.expenseBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" animationDuration={400}>
            {f.expenseBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} formatter={(value) => [`${value}%`]} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 4 }}>
        {f.expenseBreakdown.map((d, i) => (
          <span key={d.name} style={{ fontSize: 9, color: COLORS[i] }}>{d.name} {d.value}%</span>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// CashflowChart, ProfitMargin, RevenueVsExpenses — deferred to pass 2
// ------------------------------------------------------------

export function CashflowChart() {
  const data = f.cashflowBars.map((v, i) => ({ week: `W${i + 1}`, cashflow: v }))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} formatter={(value) => [`$${Number(value).toLocaleString()}`]} />
        <Bar dataKey="cashflow" fill="#412402" barSize={44} radius={[3, 3, 0, 0]} animationDuration={400}>
          {data.map((_, i) => <Cell key={i} fill={i === data.length - 1 ? '#EF9F27' : '#412402'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ProfitMargin() {
  const data = f.profitMarginTrend.map((v, i) => ({ week: `W${i + 1}`, margin: v }))
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} unit="%" domain={[40, 75]} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} formatter={(value) => [`${value}%`]} />
        <Line type="monotone" dataKey="margin" stroke="#EF9F27" strokeWidth={2} dot={{ fill: '#EF9F27', r: 3 }} animationDuration={400} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function RevenueVsExpenses() {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={f.revenueVsExpenses}>
        <CartesianGrid stroke="#222" strokeDasharray="3 3" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#666666' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, fontSize: 11 }} formatter={(value) => [`$${Number(value).toLocaleString()}`]} />
        <Bar dataKey="revenue" fill="#EF9F27" barSize={44} radius={[3, 3, 0, 0]} animationDuration={400} />
        <Bar dataKey="expenses" fill="#412402" barSize={44} radius={[3, 3, 0, 0]} animationDuration={400} />
      </BarChart>
    </ResponsiveContainer>
  )
}
