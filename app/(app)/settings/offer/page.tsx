'use client'

import { useEffect, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import { createClient } from '@/lib/supabase/client'
import { CompanyProfileFields } from '@/components/company-profile-fields'
import { EMPTY_COMPANY_PROFILE, EMPTY_OFFER_PROFILE, type CompanyProfileInput } from '@/lib/company-profile'
import { getOfferProfile, saveOfferProfile } from '@/lib/integrations/outreach/offer-actions'
import type { OfferProfile } from '@/lib/integrations/outreach/offer-profile'
import { saveCompanyProfile, setCompanySampleMode } from '@/lib/company-profile-actions'

export default function CompanyProfilePage() {
  const { activeCompany, refreshCompanies } = useCompany()
  const companyId = activeCompany?.id ?? null
  const workspaceId = activeCompany?.workspace_id ?? null
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [useUsaspending, setUseUsaspending] = useState(true)
  const [identity, setIdentity] = useState<CompanyProfileInput>({ ...EMPTY_COMPANY_PROFILE })
  const [offer, setOffer] = useState<OfferProfile>({ ...EMPTY_OFFER_PROFILE })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [adminWorkspaceId, setAdminWorkspaceId] = useState<string | null>(null)
  const [changingMode, setChangingMode] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    let active = true
    ;(async () => {
      const db = createClient()
      const { data: { user } } = await db.auth.getUser()
      if (!user) return
      const { data } = await db.from('workspace_members').select('role')
        .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle()
      if (active) setAdminWorkspaceId(data?.role === 'owner' || data?.role === 'admin' ? workspaceId : null)
    })()
    return () => { active = false }
  }, [workspaceId])

  useEffect(() => {
    if (!activeCompany) return
    let active = true
    ;(async () => {
      const savedOffer = await getOfferProfile(activeCompany.id)
      if (!active) return
      setName(activeCompany.name)
      setIndustry(activeCompany.industry ?? '')
      setWebsite(activeCompany.website ?? '')
      setUseUsaspending(activeCompany.use_usaspending)
      setIdentity({
        description: activeCompany.description, contact_email: activeCompany.contact_email,
        contact_phone: activeCompany.contact_phone, linkedin_name: activeCompany.linkedin_name,
        instagram_name: activeCompany.instagram_name, facebook_name: activeCompany.facebook_name,
        pinterest_name: activeCompany.pinterest_name,
      })
      setOffer(savedOffer ?? { ...EMPTY_OFFER_PROFILE })
      setLoading(false)
    })()
    return () => { active = false }
  }, [activeCompany])

  if (!companyId) return <p>Select a company first.</p>
  if (loading) return <p>Loading company profile…</p>

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setStatus('')
    const business = await saveCompanyProfile(companyId, { name, industry, website, useUsaspending, identity })
    if (!business.ok) { setStatus(business.error); setSaving(false); return }
    const pitch = await saveOfferProfile(companyId, { ...offer, artifacts: offer.artifacts.map(a => a.trim()).filter(Boolean) })
    if (!pitch.ok) { setStatus(pitch.error); setSaving(false); return }
    await refreshCompanies()
    setStatus('Company profile saved. Each workspace tab now uses this company’s details.')
    setSaving(false)
  }

  const input = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'
  const changeMode = async () => {
    if (!activeCompany) return
    const nextIsSample = !activeCompany.is_sample
    if (!nextIsSample && !window.confirm('Switch this company to live mode? Live email sending may become available when its sending settings are active.')) return
    setChangingMode(true)
    setStatus('')
    const result = await setCompanySampleMode(activeCompany.id, nextIsSample)
    if (result.ok) {
      await refreshCompanies()
      setStatus(`Company mode changed to ${nextIsSample ? 'Sample' : 'Live'}.`)
    } else setStatus(result.error)
    setChangingMode(false)
  }
  return <form onSubmit={save} className="max-w-2xl space-y-5">
    <div><h2 className="text-lg font-semibold text-foreground">Company profile</h2><p className="text-sm text-muted-foreground">Details for this company only. Edit its contact, social, and outreach identity here.</p></div>
    <div className="rounded-md border border-border p-4 text-sm text-foreground">
      <p className="font-medium">Company mode: {activeCompany?.is_sample ? 'Sample' : 'Live'}</p>
      <p className="mt-1 text-muted-foreground">Sample companies can only use dry run sending. Live companies can send when their sending settings allow it.</p>
      {adminWorkspaceId === workspaceId && <button type="button" onClick={changeMode} disabled={changingMode} className="mt-3 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">{changingMode ? 'Changing…' : `Switch to ${activeCompany?.is_sample ? 'Live' : 'Sample'} mode`}</button>}
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block space-y-1 text-sm font-medium text-foreground">Company name<input className={input} value={name} onChange={e => setName(e.target.value)} required /></label>
      <label className="block space-y-1 text-sm font-medium text-foreground">Industry<input className={input} value={industry} onChange={e => setIndustry(e.target.value)} /></label>
      <label className="block space-y-1 text-sm font-medium text-foreground">Website<input className={input} value={website} onChange={e => setWebsite(e.target.value)} placeholder="example.com" /></label>
    </div>
    <CompanyProfileFields identity={identity} setIdentity={setIdentity} offer={offer} setOffer={setOffer} />
    <label className="flex items-start gap-2 text-sm text-foreground"><input type="checkbox" checked={useUsaspending} onChange={e => setUseUsaspending(e.target.checked)} className="mt-1" /><span>Search USAspending for federal contract activity<span className="block text-xs text-muted-foreground">Turn this off for non-federal contacts. Processing then uses general email templates based on this company’s offer.</span></span></label>
    <button type="submit" disabled={saving} className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background">{saving ? 'Saving…' : 'Save company profile'}</button>
    {status && <p role="status" className="text-sm text-foreground">{status}</p>}
  </form>
}
