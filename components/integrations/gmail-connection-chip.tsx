'use client'

/**
 * Gmail connection chip + detail popover.
 *
 * Mirrors components/integrations/stripe-connection-chip.tsx. Three states:
 *   1. not_connected  → "Connect Gmail" button
 *   2. connected      → "Gmail connected" pill, click opens detail popover
 *   3. error/expired/revoked/disconnected → warning pill
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import { useCompany } from '@/contexts/company-context'
import {
  useGmailConnectionStatus,
  getGmailConnectUrl,
} from '@/hooks/use-gmail-connection'
import { disconnectGmail } from '@/lib/integrations/actions'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatRelativeShort(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

export function GmailConnectionChip() {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null
  const { status, isLoading, refresh } = useGmailConnectionStatus(companyId)

  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!companyId) return null
  if (isLoading && !status) {
    return (
      <span
        style={{
          fontSize: 10,
          color: '#555',
          padding: '5px 10px',
          border: '1px solid #222',
          borderRadius: 6,
        }}
      >
        …
      </span>
    )
  }
  if (!status) return null

  if (status.status === 'not_connected') {
    return (
      <a
        href={getGmailConnectUrl(companyId)}
        style={{
          fontSize: 11,
          color: 'var(--mode-accent-text, #EF9F27)',
          background: 'var(--mode-card-bg, #1a1a1a)',
          border: '1px solid var(--mode-card-border, #272727)',
          borderRadius: 6,
          padding: '5px 12px',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--mode-accent, #BA7517)',
            display: 'inline-block',
          }}
        />
        Connect Gmail
      </a>
    )
  }

  const isHealthy = status.status === 'connected'
  const pillColor = isHealthy ? '#6a6' : '#c96'
  const pillBg = isHealthy ? 'rgba(106,170,106,0.08)' : 'rgba(204,153,102,0.08)'
  const pillBorder = isHealthy ? 'rgba(106,170,106,0.25)' : 'rgba(204,153,102,0.25)'

  function handleDisconnect() {
    if (!companyId) return
    startTransition(async () => {
      await disconnectGmail(companyId)
      await refresh()
      setOpen(false)
    })
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 11,
          color: pillColor,
          background: pillBg,
          border: `1px solid ${pillBorder}`,
          borderRadius: 6,
          padding: '5px 10px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: pillColor,
            display: 'inline-block',
          }}
        />
        {isHealthy ? 'Gmail connected' : `Gmail ${status.status}`}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: 280,
            background: '#141414',
            border: '1px solid #222',
            borderRadius: 10,
            padding: '12px 14px',
            zIndex: 40,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontSize: 12, color: '#ddd', fontWeight: 500, marginBottom: 10 }}>
            Gmail
          </div>

          <Row label="Account" value={status.accountLabel ?? '—'} />
          <Row label="Status" value={status.status} valueColor={pillColor} />
          <Row label="Connected" value={formatDate(status.connectedAt)} />
          <Row label="Last sync" value={formatRelativeShort(status.lastSyncedAt)} />

          {status.lastError && (
            <div
              style={{
                marginTop: 8,
                padding: '6px 8px',
                background: 'rgba(204,153,102,0.08)',
                border: '1px solid rgba(204,153,102,0.2)',
                borderRadius: 6,
                fontSize: 10,
                color: '#c96',
                wordBreak: 'break-word',
              }}
            >
              {status.lastError}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 6,
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid #222',
            }}
          >
            {!isHealthy && (
              <a
                href={getGmailConnectUrl(companyId)}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 11,
                  color: 'var(--mode-accent-text, #EF9F27)',
                  background: 'var(--mode-card-bg, #1a1a1a)',
                  border: '1px solid var(--mode-card-border, #272727)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  textDecoration: 'none',
                }}
              >
                Reconnect
              </a>
            )}
            <button
              onClick={handleDisconnect}
              disabled={isPending}
              style={{
                flex: 1,
                fontSize: 11,
                color: '#a66',
                background: 'transparent',
                border: '1px solid #3a2222',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: isPending ? 'wait' : 'pointer',
                opacity: isPending ? 0.6 : 1,
              }}
            >
              {isPending ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 0',
        fontSize: 11,
      }}
    >
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: valueColor ?? '#ccc', textAlign: 'right', maxWidth: 180, wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  )
}
