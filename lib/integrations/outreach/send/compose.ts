/**
 * Builds the final email from a draft body + the company's send settings. The
 * draft body already carries the signature the model wrote; settings let the
 * user override the sign-off and append the CAN-SPAM footer (physical mailing
 * address + unsubscribe line), which is required for compliant cold email.
 */

import { SENDER } from '../draft'
import type { SendSettings } from '../types'

export interface ComposedEmail {
  from: string
  fromName: string
  replyTo: string | null
  subject: string
  body: string
}

export function senderEmail(settings: SendSettings): string {
  return settings.sender_email?.trim() || ''
}

export function composeEmail(
  subject: string,
  draftBody: string,
  settings: SendSettings,
): ComposedEmail {
  const fromName = settings.sender_name?.trim() || SENDER.signatureName
  const footerParts: string[] = []
  if (settings.physical_address?.trim()) footerParts.push(settings.physical_address.trim())
  if (settings.unsubscribe_line?.trim()) footerParts.push(settings.unsubscribe_line.trim())

  // The body keeps the model's sign-off; we only append the optional compliance
  // footer (separated by a rule) so it reads as a normal email, not a blast.
  const body = footerParts.length > 0 ? `${draftBody}\n\n--\n${footerParts.join('\n')}` : draftBody

  return {
    from: senderEmail(settings),
    fromName,
    replyTo: settings.reply_to?.trim() || null,
    subject,
    body,
  }
}
