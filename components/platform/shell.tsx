'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useState } from 'react'
import { LayoutDashboard, Inbox, Users, Mail, PanelsTopLeft, CalendarDays, ChartNoAxesCombined, Plug, ArrowUpRight, Plus, Search, Menu, X, Radio, ChevronDown, CircleHelp, Send, PanelLeftClose } from 'lucide-react'
import { NAV, type Section } from '@/lib/platform/types'
import { usePlatform } from './provider'
import { Editor } from './editor'
import { ConnectionNotice } from './connection-notice'

const icons = { today: LayoutDashboard, inbox: Inbox, contacts: Users, email: Mail, social: PanelsTopLeft, calendar: CalendarDays, reports: ChartNoAxesCombined, connections: Plug }
export function WorkspaceShell({ children, companyControl, userControl }: { children: React.ReactNode; companyControl?: React.ReactNode; userControl?: React.ReactNode }) {
  const { href, preview, companyName, data, notice, setEditor } = usePlatform()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const section = pathname.split('/').filter(Boolean).filter(p => p !== 'preview')[0] ?? 'today'
  const active = NAV.find(n => n.id === section)
  return <div className="sg-workspace">
    <a className="sg-skip" href="#workspace-main">Skip to content</a>
    {mobileOpen && <button className="sg-mobile-shade" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sg-sidebar ${mobileOpen ? 'is-open' : ''}`}>
      <Link className="sg-wordmark" href={href('/today')}><span className="sg-logo"><Radio size={20} /></span>signalgent<span className="sg-wordmark-dot" /></Link>
      <div className="sg-company">{companyControl ?? <><span className="sg-company-avatar">{companyName.slice(0, 1)}</span><span>{companyName}<small>{preview ? 'Sample workspace' : 'Business workspace'}</small></span><ChevronDown size={14} /></>}</div>
      <button className="sg-search-button" onClick={() => setSearchOpen(true)}><Search size={15} /><span>Find a page or contact</span></button>
      <nav aria-label="Main navigation">
        {NAV.map((nav, i) => { const Icon = icons[nav.id]; return <div key={nav.id}>{i === 3 && <div className="sg-nav-label">Create & grow</div>}{i === 7 && <div className="sg-nav-divider" />}<Link href={href(`/${nav.id}`)} onClick={() => setMobileOpen(false)} aria-current={section === nav.id ? 'page' : undefined} className={`sg-nav-link ${section === nav.id ? 'is-active' : ''}`}><Icon size={18} /><span>{nav.label}</span>{nav.id === 'social' && data.content.some(c => c.status === 'review') && <span className="sg-nav-count">{data.content.filter(c => c.status === 'review').length}</span>}</Link></div> })}
        <Link className="sg-nav-link" href={preview ? '/outreach' : '/outreach'}><Send size={18} /><span>Cold outreach</span><ArrowUpRight size={14} /></Link>
      </nav>
      <div className="sg-sidebar-bottom"><div className="sg-sidebar-note"><span className="sg-signal-dot" /><span>One workspace.<br /><strong>Every conversation.</strong></span></div>{userControl ?? <div className="sg-profile"><span className="sg-company-avatar">N</span><div>{preview ? 'Preview mode' : companyName}<small>{preview ? 'Explore without sending' : 'Your communications hub'}</small></div></div>}</div>
    </aside>
    <div className="sg-main-shell">
      <header className="sg-topbar"><div className="sg-row"><button className="sg-icon-button sg-mobile-toggle" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><span className="sg-breadcrumb">Workspace <span>/</span> <strong>{active?.label ?? 'Cold outreach'}</strong></span></div><div className="sg-row">{preview && <span className="sg-preview-pill">Interactive preview</span>}<Link className="sg-icon-button" href={href('/connections')} aria-label="Connection setup"><CircleHelp size={18} /></Link><button className="sg-button sg-primary sg-compact" onClick={() => setEditor({ kind: 'content', channel: 'linkedin' })}><Plus size={16} />Create</button></div></header>
      {preview && <div className="sg-preview-banner">Sample data. Changes stay in this browser session; no emails or posts are sent.<Link href="/login">Open your workspace <ArrowUpRight size={12} /></Link></div>}
      <main id="workspace-main" className="sg-main"><Suspense><ConnectionNotice /></Suspense>{children}</main>
    </div>
    {notice && <div className="sg-toast" role="status">{notice}</div>}
    <Editor />
    {searchOpen && <div className="sg-modal-backdrop" onClick={() => setSearchOpen(false)}><div role="dialog" aria-modal="true" aria-label="Search workspace" className="sg-search-dialog" onClick={e => e.stopPropagation()}><div className="sg-row"><Search size={20} /><input aria-label="Search pages and contacts" autoFocus placeholder="Search pages or contacts…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false) }} /><button className="sg-icon-button" aria-label="Close search" onClick={() => setSearchOpen(false)}><X size={18} /></button></div><div className="sg-search-results">{NAV.filter(n => n.label.toLowerCase().includes(query.toLowerCase())).map(n => <Link onClick={() => setSearchOpen(false)} key={n.id} href={href(`/${n.id}`)}>{n.label}<ArrowUpRight size={15} /></Link>)}{query && data.contacts.filter(c => `${c.name} ${c.email}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8).map(c => <Link key={c.id} href={href('/contacts')} onClick={() => { setSearchOpen(false); setEditor({ kind: 'contact', item: c }) }}>{c.name}<small>{c.email}</small></Link>)}</div></div></div>}
  </div>
}
