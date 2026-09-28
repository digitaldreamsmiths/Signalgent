'use client'

import type { CompanyProfileInput } from '@/lib/company-profile'
import type { OfferProfile } from '@/lib/integrations/outreach/offer-profile'

type Props = {
  identity: CompanyProfileInput
  setIdentity: (next: CompanyProfileInput) => void
  offer: OfferProfile
  setOffer: (next: OfferProfile) => void
}

const field = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'
const label = 'block space-y-1 text-sm font-medium text-foreground'

export function CompanyProfileFields({ identity, setIdentity, offer, setOffer }: Props) {
  const setCompany = (key: keyof CompanyProfileInput, value: string) => setIdentity({ ...identity, [key]: value })
  const setPitch = (key: keyof OfferProfile, value: string) => setOffer({ ...offer, [key]: value })
  return <div className="space-y-5">
    <section className="space-y-3">
      <div><h3 className="text-sm font-semibold text-foreground">Business identity</h3><p className="text-xs text-muted-foreground">These details belong to this company and appear across its workspace.</p></div>
      <label className={label}>What this company does<textarea className={field} rows={3} value={identity.description} onChange={e => setCompany('description', e.target.value)} placeholder="Describe the business in a few sentences" required /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>Contact email<input className={field} type="email" value={identity.contact_email} onChange={e => setCompany('contact_email', e.target.value)} placeholder="hello@example.com" required /></label>
        <label className={label}>Phone (optional)<input className={field} type="tel" value={identity.contact_phone} onChange={e => setCompany('contact_phone', e.target.value)} /></label>
      </div>
    </section>
    <section className="space-y-3">
      <div><h3 className="text-sm font-semibold text-foreground">Social identities</h3><p className="text-xs text-muted-foreground">Names or handles only. Connect an account separately before publishing.</p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {([['linkedin_name', 'LinkedIn'], ['instagram_name', 'Instagram'], ['facebook_name', 'Facebook'], ['pinterest_name', 'Pinterest']] as const).map(([key, title]) => <label className={label} key={key}>{title}<input className={field} value={identity[key]} onChange={e => setCompany(key, e.target.value)} placeholder={`${title} name or handle`} /></label>)}
      </div>
    </section>
    <section className="space-y-3">
      <div><h3 className="text-sm font-semibold text-foreground">Outreach offer</h3><p className="text-xs text-muted-foreground">Used only for this company’s outreach drafts and templates.</p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>Product or service<input className={field} value={offer.product} onChange={e => setPitch('product', e.target.value)} required /></label>
        <label className={label}>Website domain<input className={field} value={offer.site} onChange={e => setPitch('site', e.target.value)} placeholder="example.com" required /></label>
      </div>
      <label className={label}>Audience<input className={field} value={offer.audience} onChange={e => setPitch('audience', e.target.value)} placeholder="Who receives outreach?" required /></label>
      <label className={label}>Pitch<textarea className={field} rows={3} value={offer.pitch} onChange={e => setPitch('pitch', e.target.value)} placeholder="Describe what you offer in concrete terms" required /></label>
      <label className={label}>Concrete examples or deliverables<textarea className={field} rows={3} value={offer.artifacts.join('\n')} onChange={e => setOffer({ ...offer, artifacts: e.target.value.split('\n') })} placeholder="One per line" required /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>Sign-off<input className={field} value={offer.sign_off} onChange={e => setPitch('sign_off', e.target.value)} required /></label>
        <label className={label}>Signature name<input className={field} value={offer.signature_name} onChange={e => setPitch('signature_name', e.target.value)} required /></label>
        <label className={label}>Customer proof (optional)<input className={field} value={offer.user_count} onChange={e => setPitch('user_count', e.target.value)} placeholder="e.g. Used by 20 teams" /></label>
        <label className={label}>Results proof (optional)<input className={field} value={offer.pipeline} onChange={e => setPitch('pipeline', e.target.value)} placeholder="Only claims you can support" /></label>
      </div>
    </section>
  </div>
}
