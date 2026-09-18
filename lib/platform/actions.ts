'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCompanyAccess } from '@/lib/integrations/auth'
import { validateContent, validateContact, validateCampaign, validUuid } from './validation'
import { EMPTY_WORKSPACE, type WorkspaceData, type ContentItem, type Contact, type Campaign, type ChannelAccount, type Result } from './types'

function failure(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : ''
  if (/schema cache|does not exist|relation|PGRST|42P01/.test(message)) return { ok: false, error: 'The new workspace storage is not installed yet. Your existing outreach is still available.' }
  return { ok: false, error: message || 'The workspace could not be saved. Try again.' }
}
const ACCOUNT_COLUMNS = 'id, service, account_label, account_identifier, status, scopes, last_error'
type AccountRow = { id: string; service: string; account_label: string | null; account_identifier: string | null; status: string; scopes: string[] | null; last_error: string | null }
function toChannelAccount(a: AccountRow): ChannelAccount {
  return { id: a.id, service: a.service, label: a.account_label ?? a.account_identifier ?? a.service, status: a.status, scopes: a.scopes ?? [], error: a.last_error ?? null }
}
async function authorize(companyId: string) {
  if (!validUuid(companyId)) throw new Error('Choose a business first.')
  await requireCompanyAccess(companyId)
  return createClient()
}
/** Existing integrations must remain available when new workspace tables lag deployment. */
export async function readWorkspaceAccounts(companyId: string): Promise<Result<ChannelAccount[]>> {
  try {
    const db = await authorize(companyId)
    const { data, error } = await db.from('connected_accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('company_id', companyId).neq('status', 'revoked').order('created_at')
    if (error) throw new Error(error.message)
    return { ok: true, data: (data ?? []).map(toChannelAccount) }
  } catch (error) { return failure(error) }
}
export async function readWorkspace(companyId: string): Promise<Result<WorkspaceData>> {
  try {
    const db = await authorize(companyId)
    const [content, contacts, campaigns, accounts, sent, queued, failed, prospects] = await Promise.all([
      db.from('platform_content').select('*').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(1000),
      db.from('platform_contacts').select('*').eq('company_id', companyId).order('name').limit(1000),
      db.from('platform_campaigns').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1000),
      db.from('connected_accounts').select(ACCOUNT_COLUMNS).eq('company_id', companyId).neq('status', 'revoked').order('created_at'),
      db.from('outreach_sends').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'sent'),
      db.from('outreach_sends').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'queued'),
      db.from('outreach_sends').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'failed'),
      db.from('outreach_prospects').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    ])
    for (const response of [content, contacts, campaigns, accounts, sent, queued, failed, prospects]) if (response.error) throw new Error(response.error.message)
    return { ok: true, data: { ...EMPTY_WORKSPACE, content: content.data ?? [], contacts: contacts.data ?? [], campaigns: campaigns.data ?? [], accounts: (accounts.data ?? []).map(toChannelAccount), outreach: { sent: sent.count ?? 0, queued: queued.count ?? 0, failed: failed.count ?? 0, prospects: prospects.count ?? 0 } } }
  } catch (error) { return failure(error) }
}
export async function saveContent(companyId: string, input: ContentItem): Promise<Result<ContentItem>> {
  try {
    const db = await authorize(companyId)
    if (!validUuid(input.id)) throw new Error('Invalid content identifier.')
    const values = validateContent(input)
    if (values.campaign_id) {
      const { data } = await db.from('platform_campaigns').select('id').eq('id', values.campaign_id).eq('company_id', companyId).maybeSingle()
      if (!data) throw new Error('Choose a campaign from this business.')
    }
    // Never allow a client to move an existing record between companies.
    const existing = await db.from('platform_content').select('company_id').eq('id', input.id).maybeSingle()
    if (existing.error) throw new Error(existing.error.message)
    if (existing.data && existing.data.company_id !== companyId) throw new Error('Content belongs to a different business.')
    const result = existing.data
      ? await db.from('platform_content').update({ ...values, updated_at: new Date().toISOString() }).eq('id', input.id).eq('company_id', companyId).select().single()
      : await db.from('platform_content').insert({ id: input.id, company_id: companyId, ...values }).select().single()
    if (result.error) throw new Error(result.error.message)
    return { ok: true, data: result.data }
  } catch (error) { return failure(error) }
}
export async function saveContact(companyId: string, input: Contact): Promise<Result<Contact>> {
  try {
    const db = await authorize(companyId)
    if (!validUuid(input.id)) throw new Error('Invalid contact identifier.')
    const values = validateContact(input)
    const existing = await db.from('platform_contacts').select('company_id').eq('id', input.id).maybeSingle()
    if (existing.error) throw new Error(existing.error.message)
    if (existing.data && existing.data.company_id !== companyId) throw new Error('Contact belongs to a different business.')
    const result = existing.data
      ? await db.from('platform_contacts').update({ ...values, updated_at: new Date().toISOString() }).eq('id', input.id).eq('company_id', companyId).select().single()
      : await db.from('platform_contacts').insert({ id: input.id, company_id: companyId, ...values }).select().single()
    if (result.error) throw new Error(result.error.code === '23505' ? 'A contact with that email already exists in this business.' : result.error.message)
    return { ok: true, data: result.data }
  } catch (error) { return failure(error) }
}
export async function saveCampaign(companyId: string, input: Campaign): Promise<Result<Campaign>> {
  try {
    const db = await authorize(companyId)
    if (!validUuid(input.id)) throw new Error('Invalid campaign identifier.')
    const values = validateCampaign(input)
    const existing = await db.from('platform_campaigns').select('company_id').eq('id', input.id).maybeSingle()
    if (existing.error) throw new Error(existing.error.message)
    if (existing.data && existing.data.company_id !== companyId) throw new Error('Campaign belongs to a different business.')
    const result = existing.data
      ? await db.from('platform_campaigns').update({ ...values, updated_at: new Date().toISOString() }).eq('id', input.id).eq('company_id', companyId).select().single()
      : await db.from('platform_campaigns').insert({ id: input.id, company_id: companyId, ...values }).select().single()
    if (result.error) throw new Error(result.error.message)
    return { ok: true, data: result.data }
  } catch (error) { return failure(error) }
}
/** Soft-revoke one account. The row stays for the audit trail; every reader filters `revoked` out. */
export async function disconnectAccount(companyId: string, accountId: string): Promise<Result<true>> {
  try {
    if (!validUuid(accountId)) throw new Error('Choose an account to disconnect.')
    const db = await authorize(companyId)
    const { data, error } = await db.from('connected_accounts')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', accountId).eq('company_id', companyId).select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) throw new Error('That account is no longer connected.')
    return { ok: true, data: true }
  } catch (error) { return failure(error) }
}
