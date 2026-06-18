'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import { getInitials, getAvatarColor } from '@/lib/company-avatar'
import { AddCompanyModal } from './add-company-modal'
import type { Company } from '@/lib/types'

function CompanyAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const color = getAvatarColor(name)
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color.bg,
        color: color.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.38),
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  )
}

export function CompanySwitcher() {
  const { companies, activeCompany, setActiveCompany, isLoading } = useCompany()
  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const handleSelect = useCallback(
    (company: Company) => {
      setActiveCompany(company)
      setOpen(false)
    },
    [setActiveCompany]
  )

  if (isLoading) {
    return <div style={{ width: 100, height: 28, borderRadius: 20, background: 'var(--app-card)' }} />
  }

  const hasCompanies = companies.length > 0

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: hasCompanies
            ? `1px solid ${open ? 'var(--app-faint)' : 'var(--app-border)'}`
            : '1px dashed var(--app-border)',
          borderRadius: 20,
          padding: '4px 10px 4px 6px',
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--app-text-2)',
          transition: 'border-color 150ms',
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.borderColor = 'var(--app-faint)'
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.borderColor = 'var(--app-border)'
        }}
      >
        {activeCompany ? (
          <>
            <CompanyAvatar name={activeCompany.name} size={24} />
            <span>{activeCompany.name}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.5 }}>
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </>
        ) : (
          <span style={{ color: 'var(--app-muted)' }}>Add company</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            minWidth: 240,
            background: 'var(--app-card)',
            border: '1px solid var(--app-border)',
            borderRadius: 10,
            padding: 6,
            zIndex: 50,
          }}
        >
          {/* Company list */}
          {companies.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              {companies.map((company) => {
                const isActive = activeCompany?.id === company.id
                return (
                  <button
                    key={company.id}
                    onClick={() => handleSelect(company)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '8px 10px',
                      background: isActive ? 'var(--app-hover)' : 'transparent',
                      border: 'none',
                      borderRadius: 7,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 100ms',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--app-hover)' }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <CompanyAvatar name={company.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--app-text)' }}>{company.name}</div>
                      {company.industry && (
                        <div style={{ fontSize: 11, color: 'var(--app-muted)', marginTop: 1 }}>{company.industry}</div>
                      )}
                    </div>
                    {isActive && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#5DCAA5" strokeWidth="1.5">
                        <polyline points="3,7 6,10 11,4" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Divider */}
          {companies.length > 0 && <div style={{ height: 1, background: 'var(--app-border)', margin: '2px 0' }} />}

          {/* Add company */}
          <button
            onClick={() => { setOpen(false); setModalOpen(true) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              background: 'transparent',
              border: 'none',
              borderRadius: 7,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 100ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--app-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="var(--app-muted)" strokeWidth="1.5" fill="none">
              <line x1="7" y1="3" x2="7" y2="11" />
              <line x1="3" y1="7" x2="11" y2="7" />
            </svg>
            <span style={{ fontSize: 12, color: 'var(--app-muted)' }}>Add company</span>
          </button>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--app-border)', margin: '2px 0' }} />

          {/* Manage */}
          <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--app-faint)' }}>
            Manage companies
          </div>
        </div>
      )}

      {/* Add company modal */}
      <AddCompanyModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
