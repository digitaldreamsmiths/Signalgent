'use client'

import { useState } from 'react'
import { CompanyProfileFields } from '@/components/company-profile-fields'
import { EMPTY_COMPANY_PROFILE, EMPTY_OFFER_PROFILE } from '@/lib/company-profile'
import { createCompanyWithProfile } from '@/lib/company-profile-actions'
import { useCompany } from '@/contexts/company-context'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const INDUSTRIES = [
  'Technology',
  'Marketing & Advertising',
  'E-commerce',
  'Professional Services',
  'Healthcare',
  'Finance',
  'Real Estate',
  'Education',
  'Food & Beverage',
  'Other',
]

interface AddCompanyModalProps {
  open: boolean
  onClose: () => void
}

export function AddCompanyModal({ open, onClose }: AddCompanyModalProps) {
  const { activeCompany, refreshCompanies, setActiveCompany } = useCompany()
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [useUsaspending, setUseUsaspending] = useState(false)
  const [identity, setIdentity] = useState({ ...EMPTY_COMPANY_PROFILE })
  const [offer, setOffer] = useState({ ...EMPTY_OFFER_PROFILE })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function resetForm() {
    setName('')
    setIndustry('')
    setWebsite('')
    setUseUsaspending(false)
    setIdentity({ ...EMPTY_COMPANY_PROFILE })
    setOffer({ ...EMPTY_OFFER_PROFILE })
    setError(null)
    setLoading(false)
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      resetForm()
      onClose()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Company name is required.')
      return
    }

    setLoading(true)
    setError(null)

    if (!activeCompany) {
      setError('Select a company in the workspace first.')
      setLoading(false)
      return
    }

    const result = await createCompanyWithProfile(activeCompany.id, {
      name, industry, website, useUsaspending, identity, offer,
    })
    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }
    await refreshCompanies()
    setActiveCompany(result.data)
    resetForm()
    onClose()
  }

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 14,
          padding: 28,
          width: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          maxWidth: 'calc(100vw - 40px)',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={() => { resetForm(); onClose() }}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#555',
            padding: 4,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.5" fill="none">
            <line x1="2" y1="2" x2="12" y2="12" />
            <line x1="12" y1="2" x2="2" y2="12" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 500, color: '#ffffff' }}>Add company</h2>
          <p style={{ fontSize: 11, color: '#666666', marginTop: 4 }}>
            You can manage multiple companies from one workspace.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label htmlFor="company-name" style={{ fontSize: 11, color: '#888' }}>Company name</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              required
            />
            {error && (
              <span style={{ fontSize: 11, color: '#E24B4A', marginTop: 2 }}>{error}</span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label htmlFor="industry" style={{ fontSize: 11, color: '#888' }}>Industry</Label>
            <Select value={industry} onValueChange={(v) => setIndustry(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Select industry (optional)" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label htmlFor="website" style={{ fontSize: 11, color: '#888' }}>Website</Label>
            {/* type="text", not "url": browser url validation rejects bare
                domains ("www.acme.com"), which is what people actually type.
                normalizeWebsiteUrl prepends https:// at submit. */}
            <Input
              id="website"
              type="text"
              inputMode="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="yoursite.com"
            />
          </div>

          <CompanyProfileFields identity={identity} setIdentity={setIdentity} offer={offer} setOffer={setOffer} />

          <label style={{ display: 'flex', gap: 8, color: '#ddd', fontSize: 12 }}><input type="checkbox" checked={useUsaspending} onChange={(e) => setUseUsaspending(e.target.checked)} /><span>Search USAspending for federal contract activity<br /><small style={{ color: '#888' }}>Turn off for non-federal contacts; use email templates instead.</small></span></label>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: 40,
              background: loading ? '#555' : '#ffffff',
              color: loading ? '#999' : '#000000',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 150ms',
            }}
          >
            {loading ? 'Adding...' : 'Add company'}
          </button>
        </form>
      </div>
    </div>
  )
}
