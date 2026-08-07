'use client'

import { useState } from 'react'
import { setDisposition } from '@/lib/integrations/outreach/actions'
import type { Disposition, OutreachProspectView } from '@/lib/integrations/outreach/types'

const BORDER = 'var(--app-border)'
const CARD = 'var(--app-card)'
const CARD2 = 'var(--app-card-2)'
const TEXT = 'var(--app-text)'
const MUTED = 'var(--app-muted)'
const ACCENT = '#D85A30'

/**
 * Deep link to the conversation in Gmail. Answering happens there — composing
 * replies in-app is explicitly out of scope for v1 (docs/specs/signalgent-govcon-v1.md).
 *
 * The `u/<email>` form makes Gmail resolve the right account rather than
 * whichever happens to be signed in first, which matters as soon as someone has
 * a personal and a work account open. Falls back to `u/0` with no sender set.
 */
export function gmailThreadUrl(threadId: string, senderEmail: string | null): string {
  const account = senderEmail?.trim() ? encodeURIComponent(senderEmail.trim()) : '0'
  return `https://mail.google.com/mail/u/${account}/#all/${threadId}`
}

/** Named entities worth handling; everything else goes through the numeric path. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

/**
 * Gmail's API returns snippets HTML-escaped ("wasn&#39;t delivered"), and we
 * store them verbatim — so previews have been rendering raw entities. Decode at
 * display: it fixes the messages already captured, not just future ones, and is
 * idempotent for text with no entities.
 *
 * Deliberately NOT innerHTML-based — this is untrusted inbound content, and
 * React escapes whatever this returns on render, so a decoded "<" stays text.
 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

function fmtWhen(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days === 0) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const DISPO_PILL: Partial<Record<Disposition, { label: string; color: string }>> = {
  interested: { label: 'interested', color: '#1D9E75' },
  not_interested: { label: 'not interested', color: '#BA7517' },
  bounced: { label: 'bounced', color: '#b04545' },
  unsubscribed: { label: 'opt-out', color: '#b04545' },
}

function ReplyCard({ p, companyId, senderEmail, onChanged }: {
  p: OutreachProspectView
  companyId: string
  senderEmail: string | null
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const triage = async (d: Disposition) => {
    setBusy(true)
    setError(null)
    const r = await setDisposition(companyId, p.id, d)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onChanged()
  }

  const needsTriage = p.disposition === 'replied'
  const pill = DISPO_PILL[p.disposition]

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderLeft: `3px solid ${needsTriage ? ACCENT : BORDER}`, borderRadius: 8, padding: 12, background: CARD, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{p.recipient_name ?? p.domain ?? p.email}</span>
        <span style={{ fontSize: 11, color: MUTED, fontFamily: 'var(--font-mono)' }}>{p.reply_from ?? p.email}</span>
        {pill && (
          <span style={{ fontSize: 9, fontWeight: 600, color: pill.color, border: `1px solid ${pill.color}`, borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
            {pill.label}
          </span>
        )}
        <span style={{ fontSize: 10, color: MUTED, marginLeft: 'auto' }}>{fmtWhen(p.disposition_at)}</span>
      </div>

      {p.reply_subject && (
        <div style={{ fontSize: 12, color: 'var(--app-text-2)' }}>
          <span style={{ color: MUTED }}>Re:</span> {decodeEntities(p.reply_subject)}
        </div>
      )}
      {p.reply_snippet ? (
        <div style={{ fontSize: 12, color: 'var(--app-text-2)', lineHeight: 1.55, background: CARD2, borderRadius: 6, padding: '8px 10px' }}>
          {decodeEntities(p.reply_snippet)}…
        </div>
      ) : (
        <div style={{ fontSize: 11, color: MUTED }}>
          Reply detected, but no preview was captured. Open the thread to read it.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {needsTriage ? (
          <>
            <button disabled={busy} onClick={() => triage('interested')} style={btn('#1D9E75')}>Interested</button>
            <button disabled={busy} onClick={() => triage('not_interested')} style={btnGhost('#BA7517')}>Not interested</button>
            <button disabled={busy} onClick={() => triage('unsubscribed')} style={btnGhost('#b04545')} title="Suppress this address from all future sending">Opt out</button>
          </>
        ) : (
          <button disabled={busy} onClick={() => triage('replied')} style={btnGhost()} title="Move back to needs-triage">Re-triage</button>
        )}
        {p.thread_id && (
          <a
            href={gmailThreadUrl(p.thread_id, senderEmail)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btnGhost(ACCENT), textDecoration: 'none', display: 'inline-block', marginLeft: 'auto' }}
          >
            Open in Gmail ↗
          </a>
        )}
        {error && <span style={{ fontSize: 11, color: '#d98a8a' }}>{error}</span>}
      </div>
    </div>
  )
}

/**
 * Reply triage — Phase 3 of docs/specs/signalgent-govcon-v1.md.
 *
 * The scanner already detects replies and files a neutral `replied`
 * disposition; until now that just moved a row into a list. This turns it into
 * a worklist: everything awaiting a human decision first, one click to
 * classify, and a deep link out to Gmail to actually answer.
 */
export function ReplyInbox({ prospects, companyId, senderEmail, onChanged }: {
  prospects: OutreachProspectView[]
  companyId: string
  senderEmail: string | null
  onChanged: () => void
}) {
  const needsTriage = prospects.filter((p) => p.disposition === 'replied')
  const triaged = prospects.filter((p) => p.disposition !== 'replied')

  if (prospects.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 16 }}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 14, color: 'var(--app-text-2)', marginBottom: 6 }}>No replies yet</div>
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
            “Scan replies” checks your mailbox and files responses here automatically. Anyone who replies is
            suppressed from further follow-ups straight away, so nobody gets nudged after answering.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {needsTriage.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Needs triage {needsTriage.length}
          </div>
          {needsTriage.map((p) => (
            <ReplyCard key={p.id} p={p} companyId={companyId} senderEmail={senderEmail} onChanged={onChanged} />
          ))}
        </>
      )}
      {triaged.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: needsTriage.length > 0 ? 6 : 0 }}>
            Triaged {triaged.length}
          </div>
          {triaged.map((p) => (
            <ReplyCard key={p.id} p={p} companyId={companyId} senderEmail={senderEmail} onChanged={onChanged} />
          ))}
        </>
      )}
    </div>
  )
}

function btn(bg: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, color: '#fff', background: bg, border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }
}
function btnGhost(color = 'var(--app-text-2)'): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, color, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }
}
