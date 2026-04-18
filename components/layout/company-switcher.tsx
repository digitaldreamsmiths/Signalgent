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
    return <div style={{ width: 100, height: 28, borderRadius: 20, background: '#1a1a1a' }} />
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
            ? `1px solid ${open ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.10)'}`
            : '1px dashed rgba(255,255,255,0.15)',
          borderRadius: 20,
          padding: '4px 10px 4px 6px',
          cursor: 'pointer',
          fontSize: 12,
          color: 'rgba(255,255,255,0.7)',
          transition: 'border-color 150ms',
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.20)'
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.borderColor = hasCompanies ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.15)'
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
          <span style={{ color: '#666' }}>Add company</span>
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
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
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
                      background: isActive ? '#252525' : 'transparent',
                      border: 'none',
                      borderRadius: 7,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 100ms',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = '#222' }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <CompanyAvatar name={company.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#ffffff' }}>{company.name}</div>
                      {company.industry && (
                        <div style={{ fontSize: 11, color: '#666666', marginTop: 1 }}>{company.industry}</div>
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
          {companies.length > 0 && <div style={{ height: 1, background: '#222', margin: '2px 0' }} />}

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
            onMouseEnter={(e) => { e.currentTarget.style.background = '#222' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="#888" strokeWidth="1.5" fill="none">
              <line x1="7" y1="3" x2="7" y2="11" />
              <line x1="3" y1="7" x2="11" y2="7" />
            </svg>
            <span style={{ fontSize: 12, color: '#888' }}>Add company</span>
          </button>

          {/* Divider */}
          <div style={{ height: 1, background: '#222', margin: '2px 0' }} />

          {/* Manage */}
          <div style={{ padding: '6px 10px', fontSize: 11, color: '#555' }}>
            Manage companies
          </div>
        </div>
      )}

      {/* Add company modal */}
      <AddCompanyModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
