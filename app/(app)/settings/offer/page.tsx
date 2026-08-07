'use client'

import { useEffect, useState } from 'react'
import { useCompany } from '@/contexts/company-context'
import { getOfferProfile, saveOfferProfile } from '@/lib/integrations/outreach/offer-actions'
import { DEFAULT_OFFER_PROFILE, type OfferProfile } from '@/lib/integrations/outreach/offer-profile'

const BORDER = 'var(--app-border)'
const MUTED = 'var(--app-muted)'
const ACCENT = '#D85A30'

const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--app-text-2)', marginBottom: 4 }
const hint: React.CSSProperties = { fontSize: 10, color: MUTED, marginTop: 3, lineHeight: 1.4 }
const input: React.CSSProperties = {
  width: '100%', background: 'var(--app-input)', border: `1px solid ${BORDER}`, borderRadius: 6,
  color: 'var(--app-text)', fontSize: 12, padding: '7px 9px',
}

function Field({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={label}>{title}</label>
      {children}
      {help && <div style={hint}>{help}</div>}
    </div>
  )
}

/**
 * Settings → Offer profile. What the outreach pipeline pitches: fed into the
 * drafting register, the built-in template rotation, and signature fallbacks.
 * Until a profile is saved (or before its migration is applied) the pipeline
 * runs on the built-in defaults shown here.
 */
export default function OfferProfilePage() {
  const { activeCompany } = useCompany()
  const companyId = activeCompany?.id ?? null

  const [profile, setProfile] = useState<OfferProfile | null>(null)
  const [artifactsText, setArtifactsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!companyId) return
    let active = true
    ;(async () => {
      const p = (await getOfferProfile(companyId)) ?? { ...DEFAULT_OFFER_PROFILE }
      if (!active) return
      setProfile(p)
      setArtifactsText(p.artifacts.join('\n'))
    })()
    return () => { active = false }
  }, [companyId])

  if (!companyId) return <div style={{ fontSize: 12, color: MUTED }}>Select a company first.</div>
  if (!profile) return <div style={{ fontSize: 12, color: MUTED }}>Loading…</div>

  const set = (patch: Partial<OfferProfile>) => setProfile((p) => (p ? { ...p, ...patch } : p))

  const save = async () => {
    setSaving(true)
    setStatus(null)
    const r = await saveOfferProfile(companyId, {
      ...profile,
      artifacts: artifactsText.split('\n').map((a) => a.trim()).filter(Boolean),
    })
    setSaving(false)
    setStatus(r.ok ? { kind: 'ok', text: 'Saved. New drafts and sends use this profile.' } : { kind: 'error', text: r.error })
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text)', marginBottom: 4 }}>Offer profile</div>
      <p style={{ fontSize: 11, color: MUTED, marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
        What outreach pitches on your behalf. The AI drafting rules, the built-in template rotation, and
        signature fallbacks all read from here. Existing drafts are not rewritten — this applies to new ones.
      </p>

      <Field title="Product name" help="As it appears mid-sentence in an email.">
        <input style={input} value={profile.product} onChange={(e) => set({ product: e.target.value })} />
      </Field>
      <Field title="Site" help="Bare domain for the signature, e.g. sourcegent.io — no https://.">
        <input style={input} value={profile.site} onChange={(e) => set({ site: e.target.value })} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field title="Sign-off" help='e.g. "Best".'>
          <input style={input} value={profile.sign_off} onChange={(e) => set({ sign_off: e.target.value })} />
        </Field>
        <Field title="Signature name">
          <input style={input} value={profile.signature_name} onChange={(e) => set({ signature_name: e.target.value })} />
        </Field>
      </div>
      <Field title="Audience" help='Who receives these emails, e.g. "a government contractor". Completes the sentence "a cold outreach email to …".'>
        <input style={input} value={profile.audience} onChange={(e) => set({ audience: e.target.value })} />
      </Field>
      <Field title="Pitch" help="One or two concrete sentences describing what the product does. Lands mid-paragraph in emails, so it must read as prose. Name real artifacts, not benefits.">
        <textarea style={{ ...input, minHeight: 64, resize: 'vertical' }} value={profile.pitch} onChange={(e) => set({ pitch: e.target.value })} />
      </Field>
      <Field title="Concrete artifacts" help="One per line. The AI must name at least one of these in every personalized email — they are what makes the pitch specific.">
        <textarea style={{ ...input, minHeight: 96, resize: 'vertical', fontFamily: 'var(--font-mono)' }} value={artifactsText} onChange={(e) => setArtifactsText(e.target.value)} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field title="User count phrase" help='Social proof, phrased for prose: "About twenty contractors". Never inflated.'>
          <input style={input} value={profile.user_count} onChange={(e) => set({ user_count: e.target.value })} />
        </Field>
        <Field title="Results phrase" help='Aggregate outcome: "over $4M in active pursuits".'>
          <input style={input} value={profile.pipeline} onChange={(e) => set({ pipeline: e.target.value })} />
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: ACCENT, border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {status && (
          <span style={{ fontSize: 11, color: status.kind === 'ok' ? '#1D9E75' : '#d98a8a' }}>{status.text}</span>
        )}
      </div>
    </div>
  )
}
