'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface AddCompanyModalProps {
  open: boolean
  onClose: () => void
}

export function AddCompanyModal({ open, onClose }: AddCompanyModalProps) {
  const { refreshCompanies, setActiveCompany } = useCompany()
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function resetForm() {
    setName('')
    setIndustry('')
    setWebsite('')
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

    const supabase = createClient()

    // Get workspace ID
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1)
      .single()

    if (!workspaces) {
      setError('No workspace found. Please complete onboarding first.')
      setLoading(false)
      return
    }

    let slug = slugify(name.trim())

    const { data, error: insertError } = await supabase
      .from('companies')
      .insert({
        workspace_id: workspaces.id,
        name: name.trim(),
        slug,
        industry: industry || null,
        website: website || null,
      })
      .select()
      .single()

    // Handle slug conflict — retry with random suffix
    if (insertError?.code === '23505') {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`
      const { data: retryData, error: retryError } = await supabase
        .from('companies')
        .insert({
          workspace_id: workspaces.id,
          name: name.trim(),
          slug,
          industry: industry || null,
          website: website || null,
        })
        .select()
        .single()

      if (retryError) {
        setError('Could not add company. Please try again.')
        setLoading(false)
        return
      }

      if (retryData) {
        await refreshCompanies()
        setActiveCompany(retryData)
        resetForm()
        onClose()
        return
      }
    }

    if (insertError) {
      setError('Could not add company. Please try again.')
      setLoading(false)
      return
    }

    if (data) {
      await refreshCompanies()
      setActiveCompany(data)
      resetForm()
      onClose()
    }
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
          width: 420,
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
            <Input
              id="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yoursite.com"
            />
          </div>

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
