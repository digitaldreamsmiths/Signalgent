'use server'

import { requireCompanyAccess } from '@/lib/integrations/auth'
import { loadGmailCredentials } from '@/lib/integrations/gmail/tokens'
import { getMessage, getThread, listMessages, sendMessage, modifyThreadLabels } from '@/lib/integrations/gmail/fetch'
import { toMessageContext } from '@/lib/integrations/gmail/threadContext'
import { normalizeToSnapshot } from '@/lib/integrations/gmail/normalize'
import { createClient } from '@/lib/supabase/server'
import { validUuid } from './validation'
import type { Result } from './types'
import type { MailList, MailThread, MailInput } from './mail-types'

async function credentials(companyId: string, accountId: string) {
  if (!validUuid(companyId) || !validUuid(accountId)) throw new Error('Choose a connected Gmail account.')
  await requireCompanyAccess(companyId)
  const creds = await loadGmailCredentials(companyId, undefined, accountId)
  if (!creds) throw new Error('Reconnect this Gmail account to continue.')
  return creds
}
function errorResult(): { ok: false; error: string } { return { ok: false, error: 'Gmail could not complete this request. Check the connection and try again.' } }
export async function readMail(companyId: string, accountId: string, query = 'in:inbox', pageToken?: string): Promise<Result<MailList>> {
  try {
    const creds = await credentials(companyId, accountId)
    if (query.length > 500 || (pageToken?.length ?? 0) > 1000) return errorResult()
    const refs = await listMessages({ accessToken: creds.accessToken, q: query, maxResults: 25, pageToken })
    const messages = []
    // Keep provider concurrency bounded for large inboxes.
    for (let i = 0; i < (refs.messages?.length ?? 0); i += 5) {
      messages.push(...await Promise.all(refs.messages!.slice(i, i + 5).map(ref => getMessage({ accessToken: creds.accessToken, id: ref.id, format: 'metadata', metadataHeaders: ['From', 'Subject'] }))))
    }
    const snapshot = normalizeToSnapshot({ profile: { emailAddress: creds.emailAddress, messagesTotal: 0, threadsTotal: 0, historyId: '' }, messages, totalUnread: 0, threadsActive: 0 })
    return { ok: true, data: { messages: snapshot.messages, nextPageToken: refs.nextPageToken } }
  } catch { return errorResult() }
}
export async function readMailThread(companyId: string, accountId: string, threadId: string): Promise<Result<MailThread>> {
  try {
    const creds = await credentials(companyId, accountId)
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(threadId)) return errorResult()
    const raw = await getThread({ accessToken: creds.accessToken, id: threadId, format: 'full' })
    return { ok: true, data: { threadId, messages: (raw.messages ?? []).map(toMessageContext).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)) } }
  } catch { return errorResult() }
}
export async function updateMailThread(companyId: string, accountId: string, threadId: string, action: 'archive' | 'read' | 'unread'): Promise<Result<true>> {
  try {
    const creds = await credentials(companyId, accountId)
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(threadId) || !['archive', 'read', 'unread'].includes(action)) return errorResult()
    await modifyThreadLabels({ accessToken: creds.accessToken, threadId, removeLabelIds: action === 'archive' ? ['INBOX'] : action === 'read' ? ['UNREAD'] : [], addLabelIds: action === 'unread' ? ['UNREAD'] : [] })
    return { ok: true, data: true }
  } catch { return errorResult() }
}
function addresses(raw: string): string {
  if (raw.length > 2000 || /[\r\n]/.test(raw)) throw new Error('Invalid recipients')
  if (!raw.trim()) return ''
  const parts = raw.split(',').map(a => a.trim())
  if (parts.length > 20 || parts.some(a => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(a))) throw new Error('Invalid recipients')
  return parts.join(', ')
}
function header(raw: string) { return raw.replace(/[\r\n]/g, ' ').trim() }
export async function sendMail(companyId: string, accountId: string, input: MailInput): Promise<Result<string>> {
  let claimed = false
  try {
    const creds = await credentials(companyId, accountId)
    if (!validUuid(input.operationId) || !input.body.trim() || input.body.length > 100000 || input.subject.length > 300) return { ok: false, error: 'Add a message and a subject under 300 characters.' }
    let to = addresses(input.to)
    const cc = addresses(input.cc)
    let subject = header(input.subject)
    const threadHeaders: string[] = []
    if (input.threadId) {
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(input.threadId)) return errorResult()
      const thread = await getThread({ accessToken: creds.accessToken, id: input.threadId, format: 'metadata', metadataHeaders: ['From', 'Reply-To', 'Subject', 'Message-ID', 'References'] })
      const messages = thread.messages ?? []
      const target = [...messages].reverse().find(m => !m.labelIds?.includes('SENT'))
      if (!target) return { ok: false, error: 'Choose an incoming message to reply to.' }
      const value = (name: string) => header(target.payload?.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '')
      const replyTo = value('Reply-To') || value('From')
      to = addresses(replyTo.match(/<([^>]+)>/)?.[1] ?? replyTo)
      subject = /^re:/i.test(value('Subject')) ? value('Subject') : `Re: ${value('Subject')}`
      if (value('Message-ID')) { threadHeaders.push(`In-Reply-To: ${value('Message-ID')}`); threadHeaders.push(`References: ${value('References')} ${value('Message-ID')}`) }
    }
    if (!to || !subject) return { ok: false, error: 'Add a recipient and subject.' }
    const db = await createClient()
    const operation = await db.from('platform_mail_operations').insert({ id: input.operationId, company_id: companyId, account_id: accountId, status: 'sending' })
    if (operation.error) {
      const { data: previous } = await db.from('platform_mail_operations').select('status, provider_message_id').eq('id', input.operationId).eq('company_id', companyId).eq('account_id', accountId).maybeSingle()
      if (previous?.status === 'sent') return { ok: true, data: previous.provider_message_id ?? '' }
      return { ok: false, error: previous ? 'This send may already be in progress. Check Gmail Sent before composing another message.' : 'Sending storage is unavailable. Complete workspace setup before sending.' }
    }
    claimed = true
    const lines = [`From: ${addresses(creds.emailAddress)}`, `To: ${to}`, ...(cc ? [`Cc: ${cc}`] : []), `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`, ...threadHeaders, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(input.body).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '']
    const sent = await sendMessage({ accessToken: creds.accessToken, rawBase64Url: Buffer.from(lines.join('\r\n')).toString('base64url'), threadId: input.threadId })
    // A failed status write must never trigger another provider send.
    const { error } = await db.from('platform_mail_operations').update({ status: 'sent', provider_message_id: sent.id }).eq('id', input.operationId).eq('company_id', companyId)
    if (error) return { ok: false, error: 'Gmail accepted the email, but its status could not be saved. Check Sent; do not resend.' }
    return { ok: true, data: sent.id }
  } catch {
    if (claimed) {
      const db = await createClient()
      await db.from('platform_mail_operations').update({ status: 'uncertain' }).eq('id', input.operationId).eq('company_id', companyId)
      return { ok: false, error: 'Delivery could not be confirmed. Check Gmail Sent before creating another send.' }
    }
    return { ok: false, error: 'Check recipients, subject, and the Gmail connection. Use comma-separated email addresses.' }
  }
}
