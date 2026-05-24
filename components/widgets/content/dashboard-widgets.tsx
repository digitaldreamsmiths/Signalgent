'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { MODES, type ModeId } from '@/contexts/mode-context'
import { useCompany } from '@/contexts/company-context'
import { useDashboardSnapshot } from '@/contexts/dashboard-snapshot-context'
import { useWidgetLiveIndicator } from '../widget-live-indicator'
import {
  useStripeConnectionStatus,
  getStripeConnectUrl,
} from '@/hooks/use-stripe-connection'
import {
  useGmailConnectionStatus,
  getGmailConnectUrl,
} from '@/hooks/use-gmail-connection'
import {
  useEtsyConnectionStatus,
  getEtsyConnectUrl,
} from '@/hooks/use-etsy-connection'
import {
  useGoogleAnalyticsConnectionStatus,
  getGoogleAnalyticsConnectUrl,
} from '@/hooks/use-google-analytics-connection'
import {
  useLinkedInConnectionStatus,
  getLinkedInConnectUrl,
} from '@/hooks/use-linkedin-connection'

const SOURCE_COLORS: Record<string, string> = {
  commerce: '#378ADD',
  communications: '#1D9E75',
  finance: '#BA7517',
  analytics: '#639922',
  marketing: '#D85A30',
}

export function IntelligenceBriefing() {
  const { snapshot, isLoading } = useDashboardSnapshot()
  const { markLive } = useWidgetLiveIndicator()
  useEffect(() => {
    if (snapshot && snapshot.activeConnectionsCount > 0) markLive()
  }, [snapshot, markLive])
  const headline = snapshot?.headline
  const pills: { key: string; label: string; live: boolean }[] = []
  if (headline) {
    pills.push({
      key: 'emails',
      label: headline.emails ? `${headline.emails.unread} unread` : '— emails',
      live: headline.emails !== null,
    })
    pills.push({
      key: 'orders',
      label: headline.orders ? `${headline.orders.count} orders` : '— orders',
      live: headline.orders !== null,
    })
    pills.push({
      key: 'revenue',
      label: headline.revenue ? `${headline.revenue.formatted} revenue` : '$— revenue',
      live: headline.revenue !== null,
    })
    pills.push({
      key: 'visits',
      label: headline.visits ? `${headline.visits.formatted} this week` : '— visits',
      live: headline.visits !== null,
    })
  }
  const anyLive = pills.some((p) => p.live)
  const message = !headline
    ? 'Loading your business snapshot…'
    : anyLive
      ? 'Live snapshot across your connected platforms. Open any mode for the full picture.'
      : 'Connect your accounts to get a daily AI-powered summary of your business. Signalgent will analyze your email, revenue, orders, and social presence to surface what matters most.'

  return (
    <div>
      <p style={{ fontSize: 13, color: '#ffffff', lineHeight: 1.6, marginBottom: 14 }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(headline ? pills : ['Loading…']).map((p) => {
          const isPlaceholder = typeof p === 'string'
          const label = isPlaceholder ? p : p.label
          const live = isPlaceholder ? false : p.live
          return (
            <span
              key={typeof p === 'string' ? p : p.key}
              style={{
                fontSize: 10,
                color: live ? '#cfd0c2' : '#999999',
                background: live ? 'rgba(99,153,34,0.08)' : 'rgba(255,255,255,0.03)',
                borderRadius: 20,
                padding: '4px 10px',
                border: live
                  ? '1px solid rgba(99,153,34,0.25)'
                  : '1px solid rgba(255,255,255,0.05)',
                opacity: isLoading && !snapshot ? 0.5 : 1,
              }}
            >
              {label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function LivePulse() {
  const { snapshot, isLoading } = useDashboardSnapshot()
  const { markLive } = useWidgetLiveIndicator()
  useEffect(() => {
    if (snapshot && snapshot.activeConnectionsCount > 0) markLive()
  }, [snapshot, markLive])
  const activeCount = snapshot?.activeConnectionsCount ?? 0
  const signals = snapshot?.recentSignals ?? []
  return (
    <div>
      <p style={{ fontSize: 13, color: '#ffffff', lineHeight: 1.6, marginBottom: 14 }}>
        {signals.length > 0
          ? 'Recent signals from your connected platforms.'
          : 'Real-time signals from your connected platforms will appear here as they happen.'}
      </p>
      {signals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {signals.map((s, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: SOURCE_COLORS[s.source] ?? '#666',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: '#ffffff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.label}
              </span>
              <span style={{ fontSize: 9, color: '#999999', flexShrink: 0 }}>{s.time}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
        <span style={{ fontSize: 11, color: '#999999' }}>
          {isLoading && !snapshot
            ? 'Loading…'
            : `${activeCount} active connection${activeCount === 1 ? '' : 's'}`}
        </span>
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
  const companyId = activeCompany?.id ?? null
  const { markLive } = useWidgetLiveIndicator()
  const { status: stripeStatus } = useStripeConnectionStatus(companyId)
  const { status: gmailStatus } = useGmailConnectionStatus(companyId)
  const { status: etsyStatus } = useEtsyConnectionStatus(companyId)
  const { status: gaStatus } = useGoogleAnalyticsConnectionStatus(companyId)
  const { status: linkedinStatus } = useLinkedInConnectionStatus(companyId)
  useEffect(() => {
    if (companyId) markLive()
  }, [companyId, markLive])

  const paymentsDone = stripeStatus?.status === 'connected'
  const emailDone = gmailStatus?.status === 'connected'
  const commerceDone = etsyStatus?.status === 'connected'
  const analyticsDone = gaStatus?.status === 'connected'
  const socialDone = linkedinStatus?.status === 'connected'

  const steps: ChecklistStep[] = [
    { label: 'Create your workspace', done: true },
    { label: 'Add your first company', done: Boolean(activeCompany) },
    {
      label: 'Connect email (Gmail or Outlook)',
      done: emailDone,
      href: emailDone || !companyId ? undefined : getGmailConnectUrl(companyId),
    },
    {
      label: 'Connect social (LinkedIn or Facebook)',
      done: socialDone,
      href: socialDone || !companyId ? undefined : getLinkedInConnectUrl(companyId),
    },
    {
      label: 'Connect payments (Stripe or QuickBooks)',
      done: paymentsDone,
      href: paymentsDone || !companyId ? undefined : getStripeConnectUrl(companyId),
    },
    {
      label: 'Connect commerce (Shopify or Etsy)',
      done: commerceDone,
      href: commerceDone || !companyId ? undefined : getEtsyConnectUrl(companyId),
    },
    {
      label: 'Connect analytics (Google Analytics)',
      done: analyticsDone,
      href: analyticsDone || !companyId ? undefined : getGoogleAnalyticsConnectUrl(companyId),
    },
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
