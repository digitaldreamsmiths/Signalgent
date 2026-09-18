'use client'

import { Plus, Plug, RefreshCw, Unplug } from 'lucide-react'
import { PROVIDERS, accountProblem, type Provider } from '@/lib/platform/connections'
import type { ChannelAccount } from '@/lib/platform/types'
import { usePlatform } from './provider'

const PREVIEW_NOTICE = 'Connections are disabled in the sample workspace. Sign in to manage your accounts.'

export function Connections() {
  const { data, preview, companyId, notify, removeAccount } = usePlatform()
  const connectHref = (provider: Provider) => companyId ? `${provider.path}?companyId=${encodeURIComponent(companyId)}` : undefined
  const legacy = PROVIDERS.filter(p => p.group === 'other' && data.accounts.some(a => a.service === p.id))
  const groups: { id: string; title: string; note?: string; providers: Provider[] }[] = [
    { id: 'email', title: 'Email', providers: PROVIDERS.filter(p => p.group === 'email') },
    { id: 'social', title: 'Social', providers: PROVIDERS.filter(p => p.group === 'social') },
    ...(legacy.length ? [{ id: 'other', title: 'Other connected services', note: 'Connected before the email and social workspace. Kept here so you can see and disconnect them.', providers: legacy }] : []),
  ]

  async function disconnect(account: ChannelAccount, provider: Provider) {
    if (preview) { notify(PREVIEW_NOTICE); return }
    const warning = provider.id === 'gmail' ? ' If cold outreach sends from this mailbox, sending stops until you reconnect.' : ''
    if (!window.confirm(`Disconnect ${account.label}? Signalgent will stop using it.${warning} You can reconnect at any time.`)) return
    await removeAccount(account.id)
  }

  function ConnectButton({ provider, existing }: { provider: Provider; existing: number }) {
    const label = existing ? 'Connect another account' : 'Connect account'
    if (preview) return <button className="sg-button" onClick={() => notify(PREVIEW_NOTICE)}><Plus size={15} />{label}</button>
    return <a className={`sg-button ${!companyId ? 'sg-disabled-link' : ''}`} href={connectHref(provider)}><Plus size={15} />{label}</a>
  }

  return <>
    <div className="sg-page-heading"><div><h1>Your channels. One home.</h1><p>Connect your accounts and see exactly what each connection supports.</p></div></div>
    {groups.map(group => <section className="sg-connections-group" key={group.id} aria-labelledby={`connections-${group.id}`}>
      <h2 id={`connections-${group.id}`}>{group.title}</h2>
      {group.note && <p className="sg-group-note">{group.note}</p>}
      <div className="sg-connections-grid">{group.providers.map(provider => {
        const accounts = data.accounts.filter(a => a.service === provider.id)
        const canAdd = !!provider.path && (provider.multi || accounts.length === 0)
        return <article className="sg-connection-card" key={provider.id}>
          <div className="sg-row sg-between"><span className="sg-provider-logo" style={{ background: provider.color }}>{provider.short}</span><span className="sg-capability">{provider.capability}</span></div>
          <h3>{provider.name}</h3>
          <p>{provider.description}</p>
          {accounts.length > 0 && <ul className="sg-account-list">{accounts.map(account => {
            const healthy = account.status === 'connected'
            const problem = accountProblem(account)
            return <li key={account.id}>
              <div className="sg-account-row"><span className={`sg-connection-dot ${healthy ? 'connected' : 'error'}`} /><span className="sg-account-label" title={account.label}>{account.label}</span><span className={`sg-status ${healthy ? 'sg-status-connected' : 'sg-status-error'}`}><span />{healthy ? 'Connected' : 'Needs attention'}</span></div>
              {problem && <p className="sg-account-error">{problem}</p>}
              <div className="sg-account-actions">
                {!healthy && provider.path && (preview ? <button className="sg-button sg-compact" onClick={() => notify(PREVIEW_NOTICE)}><RefreshCw size={13} />Reconnect</button> : <a className="sg-button sg-compact" href={connectHref(provider)}><RefreshCw size={13} />Reconnect</a>)}
                <button className="sg-button sg-compact sg-quiet" onClick={() => disconnect(account, provider)}><Unplug size={13} />Disconnect</button>
              </div>
            </li>
          })}</ul>}
          {provider.path ? (canAdd ? <ConnectButton provider={provider} existing={accounts.length} /> : null) : <span className="sg-coming-soon">Not available yet</span>}
        </article>
      })}</div>
    </section>)}
    <p className="sg-footer-note"><Plug size={14} />A connected identity does not grant publishing or messaging access. Disconnecting keeps a record of the connection but stops every use of it.</p>
  </>
}
