'use client'

import { useEffect, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import { getBillingOverview, type BillingOverview } from '@/lib/billing/actions'
import { PLANS, fmtLimit } from '@/lib/billing/plans'

const BORDER = 'var(--app-border)'
const MUTED = 'var(--app-muted)'
const ACCENT = '#D85A30'

/** Usage bar. Uncapped metrics show a count with no bar — a progress bar
 * against Infinity is meaningless. */
function Meter({ label, used, limit, note }: { label: string; used: number; limit: number; note?: string }) {
  const capped = Number.isFinite(limit)
  const pct = capped && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const colour = pct >= 100 ? '#b04545' : pct >= 80 ? '#e0a060' : ACCENT
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--app-text-2)' }}>{label}</span>
        <span style={{ fontSize: 11, color: MUTED, fontFamily: 'var(--font-mono)' }}>
          {used.toLocaleString('en-US')}{capped ? ` / ${fmtLimit(limit)}` : ''}
        </span>
      </div>
      {capped && (
        <div style={{ height: 5, background: 'var(--app-input)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: colour, transition: 'width 0.3s' }} />
        </div>
      )}
      {note && <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{note}</div>}
    </div>
  )
}

export default function PlanPage() {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null
  const [data, setData] = useState<BillingOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    let active = true
    ;(async () => {
      const d = await getBillingOverview(companyId)
      if (!active) return
      setData(d)
      setLoading(false)
    })()
    return () => { active = false }
  }, [companyId])

  if (!companyId) return <div style={{ fontSize: 12, color: MUTED }}>Select a company first.</div>
  if (loading) return <div style={{ fontSize: 12, color: MUTED }}>Loading…</div>
  if (!data) return <div style={{ fontSize: 12, color: MUTED }}>Couldn’t load plan details.</div>

  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' })

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text)', marginBottom: 4 }}>Plan &amp; usage</div>
      <p style={{ fontSize: 11, color: MUTED, marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
        What this workspace is entitled to, and what it has used. Limits apply to sending and to enrichment,
        which is where the AI cost sits.
      </p>

      {/* Current state */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--app-text)' }}>{data.plan_name}</span>
          {data.unmanaged ? (
            <span style={{ fontSize: 10, color: MUTED }}>not on a billed plan — no limits applied</span>
          ) : data.lapsed ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#b04545', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {data.status === 'trialing' ? 'trial ended' : data.status}
            </span>
          ) : data.trial_days_left !== null ? (
            <span style={{ fontSize: 10, color: '#e0a060' }}>{data.trial_days_left} day{data.trial_days_left === 1 ? '' : 's'} left in trial</span>
          ) : (
            <span style={{ fontSize: 10, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{data.status}</span>
          )}
        </div>

        {data.lapsed && (
          <div style={{ fontSize: 11, color: '#d98a8a', lineHeight: 1.5, marginBottom: 10 }}>
            Sending and enrichment are paused. Your data, drafts, and queue are untouched — they resume the
            moment the plan does.
          </div>
        )}

        <Meter label="Sends today" used={data.usage.sends_today} limit={data.usage.sends_cap} note="The lower of your daily limit, the warmup ramp, and your plan." />
        <Meter label={`Enrichments in ${monthName}`} used={data.usage.enrichments_month} limit={data.usage.enrichments_limit} note="Resets on the 1st (UTC). Each one is a prospect researched and drafted." />
        <Meter label="Prospects stored" used={data.usage.prospects} limit={data.usage.prospects_limit} />
      </div>

      {/* Plan comparison */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-text)', marginBottom: 8 }}>Plans</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PLANS.map((p) => {
          const current = p.key === data.plan_key
          return (
            <div key={p.key} style={{ border: `1px solid ${current ? ACCENT : BORDER}`, borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text)' }}>{p.name}</span>
                <span style={{ fontSize: 12, color: MUTED, fontFamily: 'var(--font-mono)' }}>
                  {p.price_usd_month === 0 ? 'free' : `$${p.price_usd_month}/mo`}
                </span>
                {current && <span style={{ fontSize: 9, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--app-text-2)', marginTop: 4, lineHeight: 1.5 }}>{p.blurb}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                {fmtLimit(p.max_daily_sends)} sends/day · {fmtLimit(p.max_enrichments_month)} enrichments/mo · {fmtLimit(p.max_prospects)} prospects
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 10, color: MUTED, marginTop: 12, lineHeight: 1.5 }}>
        Self-serve checkout isn’t wired up yet — plan changes are made for you. Get in touch to move plans.
      </div>
    </div>
  )
}
