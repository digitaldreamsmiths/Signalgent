'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { readWorkspace, saveContent, saveContact, saveCampaign } from '@/lib/platform/actions'
import { validateContent, validateContact, validateCampaign } from '@/lib/platform/validation'
import { previewWorkspace } from '@/lib/platform/preview'
import { EMPTY_WORKSPACE, type WorkspaceData, type ContentItem, type Contact, type Campaign, type Result } from '@/lib/platform/types'

type Editor = { kind: 'content'; item?: ContentItem; channel?: 'email' | 'linkedin'; date?: string } | { kind: 'contact'; item?: Contact } | { kind: 'campaign'; item?: Campaign } | null
interface PlatformContextValue {
  data: WorkspaceData; loading: boolean; error: string; notice: string; preview: boolean;
  companyId: string; companyName: string; editor: Editor; setEditor: (e: Editor) => void;
  refresh: () => Promise<void>; notify: (message: string) => void;
  persistContent: (item: ContentItem) => Promise<Result<ContentItem>>;
  persistContact: (item: Contact) => Promise<Result<Contact>>;
  persistCampaign: (item: Campaign) => Promise<Result<Campaign>>;
  href: (path: string) => string;
}
const Context = createContext<PlatformContextValue | null>(null)
export function PlatformProvider({ children, companyId = '', companyName = 'Your workspace', preview = false }: { children: ReactNode; companyId?: string; companyName?: string; preview?: boolean }) {
  const [data, setData] = useState<WorkspaceData>(EMPTY_WORKSPACE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<Editor>(null)
  const refresh = useCallback(async () => {
    if (preview) { setLoading(false); return }
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    try {
      const result = await readWorkspace(companyId)
      if (result.ok) { setData(result.data); setError('') } else setError(result.error)
    } catch { setError('Could not reach your workspace. Check your connection and try again.') }
    finally { setLoading(false) }
  }, [companyId, preview])
  useEffect(() => {
    if (preview) {
      try { const stored = sessionStorage.getItem('signalgent-preview-v1'); setData(stored ? JSON.parse(stored) : previewWorkspace()) } catch { setData(previewWorkspace()) }
      setLoading(false)
    } else { void refresh() }
  }, [preview, refresh])
  useEffect(() => { if (preview && !loading) sessionStorage.setItem('signalgent-preview-v1', JSON.stringify(data)) }, [data, loading, preview])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer) }, [notice])
  const persistContent = async (input: ContentItem): Promise<Result<ContentItem>> => {
    try {
      const item = { ...input, ...validateContent(input), company_id: companyId, updated_at: new Date().toISOString() }
      const result: Result<ContentItem> = preview ? { ok: true, data: item } : await saveContent(companyId, item)
      if (result.ok) { setData(d => ({ ...d, content: [result.data, ...d.content.filter(c => c.id !== item.id)] })); setNotice('Content saved') }
      return result
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Could not save content.' } }
  }
  const persistContact = async (input: Contact): Promise<Result<Contact>> => {
    try {
      const item = { ...input, ...validateContact(input), company_id: companyId, updated_at: new Date().toISOString() }
      if (data.contacts.some(c => c.id !== item.id && c.email.toLowerCase() === item.email)) return { ok: false, error: 'A contact with that email already exists.' }
      const result: Result<Contact> = preview ? { ok: true, data: item } : await saveContact(companyId, item)
      if (result.ok) { setData(d => ({ ...d, contacts: [result.data, ...d.contacts.filter(c => c.id !== item.id)] })); setNotice('Contact saved') }
      return result
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Could not save contact.' } }
  }
  const persistCampaign = async (input: Campaign): Promise<Result<Campaign>> => {
    try {
      const item = { ...input, ...validateCampaign(input), company_id: companyId, updated_at: new Date().toISOString() }
      const result: Result<Campaign> = preview ? { ok: true, data: item } : await saveCampaign(companyId, item)
      if (result.ok) { setData(d => ({ ...d, campaigns: [result.data, ...d.campaigns.filter(c => c.id !== item.id)] })); setNotice('Campaign saved') }
      return result
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Could not save campaign.' } }
  }
  return <Context.Provider value={{ data, loading, error, notice, preview, companyId, companyName, editor, setEditor, refresh, notify: setNotice, persistContent, persistContact, persistCampaign, href: path => preview ? `/preview${path}` : path }}>{children}</Context.Provider>
}
export function usePlatform() { const context = useContext(Context); if (!context) throw new Error('Platform provider missing'); return context }
