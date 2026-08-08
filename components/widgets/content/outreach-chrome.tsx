'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOutreach } from '@/contexts/outreach-context'
import { enrichWaveNow, ingestProspects } from '@/lib/integrations/outreach/actions'
import { processSendQueue, scanRepliesNow } from '@/lib/integrations/outreach/sending'
import { ACCENT, BORDER, CARD, MUTED, Banner, Metric, btn, btnGhost, fmtPct, fmtUsd } from './outreach-ui'
import { SendingSettingsModal } from './sending-settings-modal'
import { CampaignsModal } from './campaigns-modal'
import { SetupChecklist } from './setup-checklist'
import { TemplatesModal } from './templates-modal'

/**
 * The persistent frame around every outreach section: banners, setup checklist,
 * header + intake, the metrics bar, the modals those buttons open, and the
 * toast stack.
 *
 * Lives in the layout rather than in each route, so navigating between sections
 * no longer remounts it — half-typed contact lists survive, in-flight actions
 * keep their spinner and completion toast, and the header/metrics stop
 * re-rendering on every click.
 *
 * It also owns the workspace-wide gates (loading, "no prospects yet"), since
 * those apply regardless of which section is showing; `children` only renders
 * once there is something to show.
 */
export function OutreachChrome({ children }: { children: React.ReactNode }) {
  const {
    companyId, snapshot, loading, refresh,
    campaigns, campaignStats, campaignFilter, setCampaignFilter,
    toasts, pushToast, dismissToast, setupKey,
  } = useOutreach()

  const [raw, setRaw] = useState('')
  const [running, setRunning] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [sendingModalOpen, setSendingModalOpen] = useState(false)
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false)
  const [campaignsModalOpen, setCampaignsModalOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rawInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const c = snapshot?.counts
  // Prospects in the current campaign scope. Server-counted — the browser only
  // holds one page of rows, so this can't come from a list length any more.
  const scoped = snapshot?.views.contacts ?? 0

  // Shared ingest core: takes any text blob (pasted or read from a file), hands
  // it to the server action (which regex-extracts emails regardless of
  // separators/columns), then reports the result.
  const ingest = useCallback(
    async (text: string, onSuccess?: () => void) => {
      if (!companyId || !text.trim()) return
      // New prospects join the currently selected campaign ('all'/'none' → pool).
      const target = campaignFilter !== 'all' && campaignFilter !== 'none' ? campaignFilter : null
      const r = await ingestProspects(companyId, text, target)
      if (!r.ok) return pushToast(r.error, 'error')
      onSuccess?.()
      pushToast(
        `Added ${r.data.added}. ${r.data.duplicates} duplicate(s), ${r.data.invalid} invalid` +
          (r.data.undeliverable > 0 ? `, ${r.data.undeliverable} undeliverable (no mail server)` : '') +
          '.',
      )
      refresh()
    },
    [companyId, campaignFilter, refresh, pushToast],
  )

  const handleIngest = useCallback(() => ingest(raw, () => setRaw('')), [ingest, raw])

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = '' // reset so the same file can be re-selected
      if (!file) return
      const text = await file.text()
      await ingest(text)
    },
    [ingest],
  )

  // Wave-based: enrich one buffer's worth (~3 days of send capacity) per click
  // so time-sensitive facts stay fresh. The cron tops up automatically too;
  // click again (or wait) to enrich the next wave.
  const handleRun = useCallback(async () => {
    if (!companyId) return
    setRunning(true)
    const r = await enrichWaveNow(companyId)
    setRunning(false)
    if (!r.ok) return pushToast(r.error, 'error')
    const { enriched, drafted, skipped, remaining, cost_usd, note } = r.data
    pushToast(
      enriched === 0
        ? `Nothing enriched${note ? ` — ${note}` : ''}.`
        : `Enriched ${enriched} (${drafted} personalized, ${skipped} template). ${remaining} left for later waves. ${fmtUsd(cost_usd)} this run.`,
    )
    refresh()
  }, [companyId, refresh, pushToast])

  const handleProcessQueue = async () => {
    if (!companyId) return
    setProcessing(true)
    const r = await processSendQueue(companyId)
    setProcessing(false)
    if (!r.ok) return pushToast(r.error, 'error')
    pushToast(
      `Sent ${r.data.sent}${r.data.failed ? `, ${r.data.failed} failed` : ''}.` +
        (r.data.recovered ? ` Recovered ${r.data.recovered} send${r.data.recovered === 1 ? '' : 's'} stuck from an interrupted run — marked failed, verify in Gmail Sent before re-queuing.` : ''),
      r.data.failed || r.data.recovered ? 'error' : 'info',
    )
    refresh()
  }

  const handleScanReplies = async () => {
    if (!companyId) return
    setScanning(true)
    const r = await scanRepliesNow(companyId)
    setScanning(false)
    if (!r.ok) return pushToast(r.error, 'error')
    const { replied, bounced, unsubscribed, skipped } = r.data
    if (replied === 0 && bounced === 0 && unsubscribed === 0) {
      pushToast(`No new replies or bounces${skipped ? ` (${skipped})` : ''}.`)
    } else {
      const optPart = unsubscribed > 0 ? `, ${unsubscribed} opt-out${unsubscribed === 1 ? '' : 's'}` : ''
      pushToast(
        `Found ${replied} repl${replied === 1 ? 'y' : 'ies'}, ${bounced} bounce${bounced === 1 ? '' : 's'}${optPart}.` +
          (unsubscribed > 0 ? ' Opt-outs were flagged and suppressed from sending.' : ''),
        unsubscribed > 0 ? 'error' : 'info',
      )
    }
    refresh()
  }

  if (!companyId) return <div style={{ fontSize: 12, color: MUTED }}>Select a company to start outreach.</div>

  return (
    <div className="outreach-ws" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      {/* Inline styles can't express media queries, so the responsive bits live
          here: the two-pane grid stacks below 700px and touch targets grow. */}
      <style>{`
        .outreach-split { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); }
        @media (max-width: 700px) {
          /* The app shell hands the workspace a fixed height, but on a phone the
             wrapped header/metrics/tabs eat nearly all of it. main scrolls, so
             release the height (!important beats the inline style; flex-shrink 0
             stops the page wrapper squeezing it back) and let the page grow: the
             list caps at 38vh and scrolls, the detail pane runs at natural height. */
          .outreach-ws { height: auto !important; flex-shrink: 0; }
          .outreach-split { grid-template-columns: minmax(0, 1fr); }
          .outreach-split > :first-child { max-height: 38vh; }
          .outreach-ws button { min-height: 40px; }
          .outreach-ws input:not([type="checkbox"]):not([type="file"]) { min-height: 40px; }
        }
      `}</style>

      {/* First-run guidance. Hides itself once setup is complete. */}
      <SetupChecklist
        companyId={companyId}
        refreshKey={setupKey}
        onAction={(action) => {
          if (action === 'sending_settings') setSendingModalOpen(true)
          else if (action === 'offer_profile') router.push('/settings/offer')
          else if (action === 'connections') router.push('/settings/connections')
          else if (action === 'add_prospects') rawInputRef.current?.focus()
        }}
      />

      {/* Pipeline-stopping states. Each of these silently halts sends/scans, so
          they go first — above everything else, impossible to miss. */}
      {snapshot?.sending?.gmail && snapshot.sending.gmail.status !== 'connected' && (
        <Banner color="#b04545">
          ⚠ Gmail connection {snapshot.sending.gmail.status === 'not_connected' ? 'missing' : `in ${snapshot.sending.gmail.status} state`} — sending and reply detection are stopped
          {snapshot.sending.gmail.last_error ? `: ${snapshot.sending.gmail.last_error}` : ''}. Reconnect Gmail in Settings → Connections.
        </Banner>
      )}
      {snapshot?.sending?.pause_reason === 'bounce_rate' && !snapshot.sending.active && (
        <Banner color="#e0a060">
          ⚠ Sending auto-paused — bounce rate hit {Math.round((snapshot.sending.bounce_rate_7d ?? 0) * 100)}% over the last 7 days. Clean the list, then re-enable in <button onClick={() => setSendingModalOpen(true)} style={{ ...btnGhost('#e0a060'), padding: '2px 8px' }}>Sending</button>.
        </Banner>
      )}
      {snapshot?.sending?.pause_reason === 'manual' && !snapshot.sending.active && (c?.queued ?? 0) > 0 && (
        <Banner color="#e0a060">
          ⚠ Sending is off — {c!.queued} queued email{c!.queued === 1 ? '' : 's'} will not go out until you re-enable it in <button onClick={() => setSendingModalOpen(true)} style={{ ...btnGhost('#e0a060'), padding: '2px 8px' }}>Sending</button>.
        </Banner>
      )}

      {/* Header: title + intake */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--app-text)', margin: 0, marginRight: 4, letterSpacing: 0.2 }}>Outreach</h1>
        <select
          value={campaignFilter}
          onChange={(e) => {
            const v = e.target.value
            if (v === '__manage') {
              setCampaignsModalOpen(true)
              return // don't change the filter; the controlled value snaps back
            }
            setCampaignFilter(v)
          }}
          title="Scope the workspace to one campaign. New prospects join the selected campaign."
          style={{ background: 'var(--app-input)', border: `1px solid ${BORDER}`, borderRadius: 6, color: 'var(--app-text)', fontSize: 12, padding: '7px 8px', maxWidth: 180 }}
        >
          <option value="all">All campaigns</option>
          {campaigns.filter((cm) => cm.status === 'active').map((cm) => (
            <option key={cm.id} value={cm.id}>{cm.name} ({campaignStats.get(cm.id)?.prospects ?? 0})</option>
          ))}
          {campaigns.filter((cm) => cm.status === 'archived').map((cm) => (
            <option key={cm.id} value={cm.id}>{cm.name} (archived)</option>
          ))}
          {campaigns.length > 0 && <option value="none">No campaign</option>}
          <option value="__manage">Manage campaigns…</option>
        </select>
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          ref={rawInputRef}
          placeholder="Paste contact emails (any separator)…"
          style={{ flex: 1, minWidth: 220, background: 'var(--app-input)', border: `1px solid ${BORDER}`, borderRadius: 6, color: 'var(--app-text)', fontSize: 12, padding: '8px 10px' }}
        />
        <button onClick={handleIngest} disabled={!raw.trim()} style={btn(ACCENT)}>Add prospects</button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button onClick={() => fileInputRef.current?.click()} style={btnGhost()} title="Upload a CSV or TXT file of email addresses">Upload file</button>
        <button onClick={() => setSendingModalOpen(true)} style={btnGhost()}>Sending</button>
        <button onClick={() => setTemplatesModalOpen(true)} style={btnGhost()} title="Manage the fallback templates rotated for prospects that can't be personalized, and see their performance">Manage templates</button>
        <button onClick={handleScanReplies} disabled={scanning} style={btnGhost()} title="Check Gmail for replies and bounces, then update outcomes">
          {scanning ? 'Scanning…' : 'Scan replies'}
        </button>
        <button onClick={handleProcessQueue} disabled={processing || (c?.queued ?? 0) === 0} style={btnGhost(ACCENT)}>
          {processing ? 'Processing…' : `Process queue${c?.queued ? ` (${c.queued})` : ''}`}
        </button>
        <button onClick={handleRun} disabled={running || (c?.new ?? 0) === 0} style={btnGhost(ACCENT)} title="Enrich one wave (~3 days of send capacity). Keeps federal-award facts fresh instead of draining the whole list at once.">
          {running ? 'Enriching…' : `Enrich wave${c?.new ? ` (${c.new})` : ''}`}
        </button>
      </div>

      {/* Status bar */}
      {c && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          <Metric label="To review" value={snapshot?.views.review ?? 0} accent={ACCENT} />
          <Metric label="Prospects" value={c.total} />
          <Metric label="Sent" value={c.sent} accent="#378ADD" />
          <Metric label="Queued" value={c.queued} accent={c.queued > 0 ? ACCENT : undefined} />
          {/* Today against the cap. The warmup ramp used to be invisible math:
              the queue would go quiet mid-morning with nothing explaining why. */}
          {snapshot?.sending && (
            <Metric
              label="Today"
              value={`${snapshot.sending.sent_today}/${snapshot.sending.effective_daily_cap}`}
              accent={snapshot.sending.sent_today >= snapshot.sending.effective_daily_cap ? '#e0a060' : undefined}
              // Kept short: the tile ellipsizes its hint (full text on hover).
              hint={
                !snapshot.sending.active
                  ? 'sending is off'
                  : snapshot.sending.sent_today >= snapshot.sending.effective_daily_cap
                    ? 'resumes tomorrow'
                    : snapshot.sending.warmup_day
                      ? `warmup day ${snapshot.sending.warmup_day} → ${snapshot.sending.daily_send_limit}`
                      : 'daily limit'
              }
            />
          )}
          <Metric label="Replied" value={c.replied} accent="#1D9E75" />
          <Metric label="Reply rate" value={fmtPct(snapshot?.reply_rate ?? 0, c.sent)} />
          {/* Denominator is tracked sends, not all sends: emails sent before
              open tracking existed carry no pixel and would drag this to zero. */}
          <Metric
            label="Open rate"
            value={fmtPct(snapshot?.opens.rate ?? 0, snapshot?.opens.tracked ?? 0)}
            hint={snapshot?.opens.tracked ? `${snapshot.opens.opened} of ${snapshot.opens.tracked} tracked` : 'no tracked sends yet'}
          />
          <Metric label="API cost" value={fmtUsd(snapshot?.cost_usd_total ?? 0)} />
        </div>
      )}

      {loading && !snapshot && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: MUTED }}>Loading…</div>
      )}
      {!loading && scoped === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 16 }}>
          <div style={{ maxWidth: 460 }}>
            <div style={{ fontSize: 14, color: 'var(--app-text-2)', marginBottom: 6 }}>
              {campaignFilter === 'all' ? 'No prospects yet' : 'No prospects in this campaign yet'}
            </div>
            <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              Paste or upload contact emails above{campaignFilter !== 'all' && campaignFilter !== 'none' ? ' — they’ll join this campaign' : ''}.
              Enrichment then researches each company’s federal awards, writes a personalized email, and fact-checks it
              against what it found. Anything it can’t personalize gets one of your templates instead.
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.6 }}>
              You approve the personalized drafts; nothing sends until you turn sending on.
            </div>
          </div>
        </div>
      )}

      {scoped > 0 && children}

      {sendingModalOpen && (
        <SendingSettingsModal companyId={companyId} onClose={() => setSendingModalOpen(false)} onSaved={refresh} />
      )}

      {templatesModalOpen && (
        <TemplatesModal companyId={companyId} stats={snapshot?.template_stats ?? {}} onClose={() => setTemplatesModalOpen(false)} onChanged={refresh} />
      )}

      {campaignsModalOpen && (
        <CampaignsModal
          companyId={companyId}
          campaigns={campaigns}
          stats={campaignStats}
          onClose={() => setCampaignsModalOpen(false)}
          onChanged={refresh}
        />
      )}

      {/* Toast stack: bottom-right, above everything. Info auto-dismisses in 4s;
          errors keep their red border and stay until the × is tapped. */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 'min(360px, calc(100vw - 32px))' }}>
          {toasts.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.45, color: t.kind === 'error' ? '#d98a8a' : 'var(--app-text-2)', background: CARD, border: `1px solid ${t.kind === 'error' ? '#b04545' : BORDER}`, borderRadius: 8, padding: '10px 12px', boxShadow: '0 6px 20px rgba(0, 0, 0, 0.3)' }}>
              <span style={{ flex: 1 }}>{t.text}</span>
              <button
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss"
                style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px', minHeight: 'auto' }}
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
