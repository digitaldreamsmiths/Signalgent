import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { getAccount } from '@/lib/integrations/accounts'
import { loadOutlookCredentials } from '@/lib/integrations/outlook/tokens'
import { sendMail } from '@/lib/integrations/outlook/fetch'
import { createClient } from '@/lib/supabase/server'

const COMPANY_ID = '297f52a7-d494-43f5-b88e-bad9d2e88f5d'
const OPERATION_ID = '7c490c6b-b4c3-4563-a46c-2c8c7ef8e8ea'
const SENDER = 'hello@platetell.com'
const RECIPIENT = 'thedvegroup@gmail.com'

function page(message = ''): NextResponse {
  const safeMessage = message.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
  return new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><title>PlateTell mailbox test</title><body style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>PlateTell mailbox test</h1><p>Send one test email from ${SENDER} to ${RECIPIENT}. The PlateTell campaign stays in Dry run.</p>${safeMessage ? `<p role="status">${safeMessage}</p>` : ''}<form method="post"><button type="submit" style="font:inherit;padding:.7rem 1rem">Send one test email</button></form></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export async function GET() {
  try {
    await requireCompanyAccess(COMPANY_ID)
    return page()
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Access denied' }, { status: error instanceof IntegrationAuthError ? error.status : 500 })
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  try {
    await requireCompanyAccess(COMPANY_ID)
    const db = await createClient()
    const account = await getAccount(COMPANY_ID, 'outlook', db)
    if (account?.status !== 'connected' || account.account_identifier?.toLowerCase() !== SENDER) return page('The PlateTell mailbox is not connected.')

    const claim = await db.from('platform_mail_operations').insert({ id: OPERATION_ID, company_id: COMPANY_ID, account_id: account.id, status: 'sending' })
    if (claim.error) return page('This test was already attempted, or the send record could not be created. Check Microsoft Sent Items before doing anything else.')

    try {
      const credentials = await loadOutlookCredentials(COMPANY_ID, db)
      if (!credentials || credentials.emailAddress.toLowerCase() !== SENDER) throw new Error('Mailbox credentials unavailable')
      await sendMail(credentials.accessToken, {
        to: RECIPIENT,
        subject: 'PlateTell Microsoft 365 connection test',
        body: 'This is a one-time test email from hello@platetell.com through SignalGent to verify the Microsoft 365 mailbox connection. The PlateTell campaign remains in Dry run.',
      })
      const saved = await db.from('platform_mail_operations').update({ status: 'sent' }).eq('id', OPERATION_ID).eq('company_id', COMPANY_ID)
      return page(saved.error ? 'Microsoft accepted the message, but the test record could not be updated. Check Sent Items.' : 'Microsoft accepted the message. Check Sent Items and the recipient inbox to confirm delivery.')
    } catch {
      await db.from('platform_mail_operations').update({ status: 'uncertain' }).eq('id', OPERATION_ID).eq('company_id', COMPANY_ID)
      return page('The send could not be confirmed. Check Microsoft Sent Items before considering another attempt.')
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Send unavailable' }, { status: error instanceof IntegrationAuthError ? error.status : 500 })
  }
}
