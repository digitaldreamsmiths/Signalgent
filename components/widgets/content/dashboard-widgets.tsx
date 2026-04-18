'use client'

import Link from 'next/link'
import { MODES, type ModeId } from '@/contexts/mode-context'
import { useCompany } from '@/contexts/company-context'
import {
  useStripeConnectionStatus,
  getStripeConnectUrl,
} from '@/hooks/use-stripe-connection'

export function IntelligenceBriefing() {
  return (
    <div>
      <p style={{ fontSize: 13, color: '#ffffff', lineHeight: 1.6, marginBottom: 14 }}>
        Connect your accounts to get a daily AI-powered summary of your business.
        Signalgent will analyze your email, revenue, orders, and social presence
        to surface what matters most.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['0 emails', '0 posts queued', '$— today'].map((pill) => (
          <span
            key={pill}
            style={{
              fontSize: 10,
              color: '#999999',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 20,
              padding: '4px 10px',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {pill}
          </span>
        ))}
      </div>
    </div>
  )
}

export function LivePulse() {
  return (
    <div>
      <p style={{ fontSize: 13, color: '#ffffff', lineHeight: 1.6, marginBottom: 14 }}>
        Real-time signals from your connected platforms will appear here as they happen.
      </p>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
        <span style={{ fontSize: 11, color: '#999999' }}>0 active connections</span>
      </div>
    </div>
  )
}

const MODE_TILES_DATA: { mode: ModeId; description: string }[] = [
  { mode: 'marketing', description: 'Campaigns, content, social' },
  { mode: 'communications', description: 'Inbox, replies, threads' },
  { mode: 'finance', description: 'Revenue, expenses, cash' },
  { mode: 'commerce', description: 'Products, orders, inventory' },
  { mode: 'analytics', description: 'Traffic, conversions, insights' },
]

export function ModeTiles() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
      {MODE_TILES_DATA.map(({ mode, description }) => {
        const m = MODES[mode]
        return (
          <Link
            key={mode}
            href={m.href}
            style={{
              background: m.cardBg,
              border: `1px solid ${m.cardBorder}`,
              borderRadius: 8,
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 60,
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 500, color: m.accentText }}>{m.label}</span>
            <span style={{ fontSize: 9, color: '#999999', marginTop: 3 }}>{description}</span>
            <div style={{ width: 16, height: 2, borderRadius: 1, background: m.accent, marginTop: 'auto' }} />
          </Link>
        )
      })}
    </div>
  )
}

interface ChecklistStep {
  label: string
  done: boolean
  href?: string
}

export function SetupChecklist() {
  const { activeCompany } = useCompany()
  const { status: stripeStatus } = useStripeConnectionStatus(activeCompany?.id ?? null)
  const paymentsDone = stripeStatus?.status === 'connected'
  const paymentsHref = activeCompany ? getStripeConnectUrl(activeCompany.id) : undefined

  const steps: ChecklistStep[] = [
    { label: 'Create your workspace', done: true },
    { label: 'Add your first company', done: Boolean(activeCompany) },
    { label: 'Connect email (Gmail or Outlook)', done: false },
    { label: 'Connect social (LinkedIn or Facebook)', done: false },
    {
      label: 'Connect payments (Stripe or QuickBooks)',
      done: paymentsDone,
      href: paymentsDone ? undefined : paymentsHref,
    },
    { label: 'Connect commerce (Shopify or WooCommerce)', done: false },
  ]
  const completed = steps.filter((s) => s.done).length

  return (
    <div>
      <div style={{ fontSize: 12, color: '#999999', marginBottom: 10 }}>
        {completed} of {steps.length} complete
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map((step) => {
          const labelStyle: React.CSSProperties = {
            fontSize: 12,
            color: step.done ? '#999999' : '#ffffff',
            textDecoration: step.done ? 'line-through' : 'none',
          }
          const dot = (
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: step.done ? 'none' : '1px solid #333',
                background: step.done ? '#2a5a2a' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {step.done && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#7c7" strokeWidth="1.5">
                  <polyline points="1,4 3,6 7,2" />
                </svg>
              )}
            </div>
          )

          if (step.href) {
            return (
              <a
                key={step.label}
                href={step.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textDecoration: 'none',
                }}
              >
                {dot}
                <span style={labelStyle}>{step.label}</span>
                <span style={{ fontSize: 10, color: '#666', marginLeft: 'auto' }}>Connect →</span>
              </a>
            )
          }

          return (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {dot}
              <span style={labelStyle}>{step.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SuggestedActions() {
  const actions = [
    { action: 'Connect your Gmail account', reason: 'Get email summaries in your morning briefing' },
    { action: 'Link your Stripe dashboard', reason: 'Track revenue and cash flow automatically' },
    { action: 'Schedule your first social post', reason: 'Start building your social presence' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {actions.map((a) => (
        <div
          key={a.action}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: '#ffffff' }}>{a.action}</div>
            <div style={{ fontSize: 10, color: '#999999', marginTop: 2 }}>{a.reason}</div>
          </div>
          <span style={{ fontSize: 10, color: '#999999', cursor: 'pointer' }}>Go →</span>
        </div>
      ))}
    </div>
  )
}
