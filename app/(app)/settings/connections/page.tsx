'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SERVICES_BY_MODE, type ServiceDef } from '@/lib/integrations/services'
import { useConnectedAccounts } from '@/contexts/connected-accounts-context'
import { useCompany } from '@/contexts/company-context'

const MODE_LABELS: Record<string, string> = {
  communications: 'Communications',
  marketing: 'Marketing',
  finance: 'Finance',
  commerce: 'Commerce',
  analytics: 'Analytics',
}

const MODE_ORDER = ['communications', 'marketing', 'finance', 'commerce', 'analytics']

// ── Service icon SVGs ─────────────────────────────────────────────────────────

function ServiceIcon({ id, color }: { id: string; color: string }) {
  if (id === 'gmail') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M2 6l10 7 10-7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth="2" fill="none" />
    </svg>
  )
  if (id === 'outlook') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth="2" fill="none" />
      <path d="M2 8h20" stroke={color} strokeWidth="2" />
      <circle cx="8" cy="15" r="3" stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  )
  if (id === 'linkedin_page') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
  if (id === 'facebook_page') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
    </svg>
  )
  if (id === 'stripe_account') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="5" width="20" height="14" rx="2" stroke={color} strokeWidth="2" fill="none" />
      <path d="M2 10h20" stroke={color} strokeWidth="2" />
      <rect x="5" y="13" width="4" height="2" rx="1" fill={color} />
    </svg>
  )
  if (id === 'quickbooks') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" fill="none" />
      <path d="M9 8v8M15 8v8M9 12h6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
  if (id === 'plaid') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke={color} strokeWidth="2" fill="none" />
      <path d="M7 12h10M7 8h6M7 16h8" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
  if (id === 'shopify') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M6 2h12l2 6H4L6 2z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill="none" />
      <path d="M4 8v13a1 1 0 001 1h14a1 1 0 001-1V8" stroke={color} strokeWidth="2" fill="none" />
      <path d="M10 13h4M12 11v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
  if (id === 'google_analytics') return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="12" width="4" height="9" rx="1" fill={color} />
      <rect x="10" y="7" width="4" height="14" rx="1" fill={color} />
      <rect x="17" y="3" width="4" height="18" rx="1" fill={color} />
    </svg>
  )
  return <div style={{ width: 20, height: 20, borderRadius: 4, background: color }} />
}

// ── Service card ──────────────────────────────────────────────────────────────

function ServiceCard({ service }: { service: ServiceDef }) {
  const { isConnected, getAccount, refresh } = useConnectedAccounts()
  const { activeCompany } = useCompany()
  const router = useRouter()
  const [shopInput, setShopInput] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const connected = isConnected(service.id)
  const account = getAccount(service.id)

  async function handleConnect() {
    if (!activeCompany?.id) return

    if (service.comingSoon) return

    if (service.requiresInput) {
      if (!showInput) {
        setShowInput(true)
        return
      }
      if (!shopInput.trim()) return
      const url = new URL(service.connectPath, window.location.origin)
      url.searchParams.set('company_id', activeCompany.id)
      url.searchParams.set('shop', shopInput.trim())
      router.push(url.toString())
      return
    }

    const url = new URL(service.connectPath, window.location.origin)
    url.searchParams.set('company_id', activeCompany.id)
    router.push(url.toString())
  }

  async function handleDisconnect() {
    if (!activeCompany?.id || !account) return
    setDisconnecting(true)
    await fetch(`/api/integrations/${service.id}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: activeCompany.id }),
    })
    await refresh()
    setDisconnecting(false)
  }

  return (
    <div
      style={{
        background: '#161616',
        border: `1px solid ${connected ? '#1e2e1e' : '#1e1e1e'}`,
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: '#0e0e0e',
          border: '1px solid #222',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <ServiceIcon id={service.id} color={service.color} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#d0d0d0' }}>{service.label}</span>
          {connected && (
            <span
              style={{
                fontSize: 10,
                color: '#4CAF50',
                background: '#0d1f0d',
                border: '1px solid #1e3a1e',
                borderRadius: 4,
                padding: '1px 6px',
              }}
            >
              Connected
            </span>
          )}
          {service.comingSoon && !connected && (
            <span
              style={{
                fontSize: 10,
                color: '#666',
                background: '#111',
                border: '1px solid #222',
                borderRadius: 4,
                padding: '1px 6px',
              }}
            >
              Coming soon
            </span>
          )}
        </div>
        <p style={{ fontSize: 11, color: '#444', margin: 0, lineHeight: 1.5 }}>
          {service.description}
        </p>
        {connected && account?.account_identifier && (
          <p style={{ fontSize: 10, color: '#333', marginTop: 4 }}>
            {account.account_identifier}
          </p>
        )}

        {/* Shopify shop domain input */}
        {showInput && !connected && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <input
              value={shopInput}
              onChange={(e) => setShopInput(e.target.value)}
              placeholder={service.inputPlaceholder}
              style={{
                flex: 1,
                fontSize: 12,
                background: '#0e0e0e',
                border: '1px solid #333',
                borderRadius: 6,
                padding: '5px 10px',
                color: '#ccc',
                outline: 'none',
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              autoFocus
            />
            <button
              onClick={() => setShowInput(false)}
              style={{
                fontSize: 11,
                color: '#444',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '5px 8px',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Action button */}
      <div style={{ flexShrink: 0 }}>
        {connected ? (
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{
              fontSize: 11,
              color: '#555',
              background: 'none',
              border: '1px solid #222',
              borderRadius: 6,
              padding: '5px 12px',
              cursor: 'pointer',
              transition: 'color 150ms',
            }}
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={service.comingSoon}
            style={{
              fontSize: 11,
              color: service.comingSoon ? '#333' : '#d0d0d0',
              background: service.comingSoon ? 'none' : '#1e1e1e',
              border: `1px solid ${service.comingSoon ? '#1a1a1a' : '#2a2a2a'}`,
              borderRadius: 6,
              padding: '5px 12px',
              cursor: service.comingSoon ? 'default' : 'pointer',
              transition: 'background 150ms',
            }}
          >
            {service.requiresInput && showInput ? 'Continue' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const { connectedAccounts, isLoading } = useConnectedAccounts()
  const connectedCount = connectedAccounts.length

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, color: '#d0d0d0', margin: 0 }}>
            Connections
          </h2>
          {!isLoading && connectedCount > 0 && (
            <span style={{ fontSize: 11, color: '#4CAF50' }}>
              {connectedCount} active
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#444', marginTop: 4 }}>
          Connect your platforms to replace sample data with live data in every widget.
        </p>
      </div>

      {/* Service groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {MODE_ORDER.map((mode) => {
          const services = SERVICES_BY_MODE[mode]
          if (!services?.length) return null
          return (
            <div key={mode}>
              <p
                style={{
                  fontSize: 10,
                  color: '#333',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 8,
                }}
              >
                {MODE_LABELS[mode]}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {services.map((service) => (
                  <ServiceCard key={service.id} service={service} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
