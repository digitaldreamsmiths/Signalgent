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

/**
 * The sign-off block to append when the body has none. Personalized drafts carry
 * the model's own sign-off (the register mandates the site line), so this only
 * fires for user templates, which have no sign-off of their own.
 */
function signatureFor(settings: SendSettings): string {
  const custom = settings.signature?.trim()
  if (custom) return custom
  const name = settings.sender_name?.trim() || SENDER.signatureName
  return `${SENDER.signOff},\n${name}\n${SENDER.site}`
}

/** Whether the body already signs off, so we don't stack a second signature. */
function hasSignature(body: string, settings: SendSettings): boolean {
  const custom = settings.signature?.trim()
  if (custom && body.includes(custom)) return true
  const name = settings.sender_name?.trim() || SENDER.signatureName
  return body.includes(SENDER.site) || body.includes(name)
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

  // Sign off before the compliance footer. Personalized drafts already carry the
  // model's sign-off and are left untouched; user templates have none, and
  // without this they arrived signed by nothing but the mailing address.
  const signed = hasSignature(draftBody, settings)
    ? draftBody
    : `${draftBody.trimEnd()}\n\n${signatureFor(settings)}`

  // Compliance footer (separated by a rule) so it reads as a normal email, not a blast.
  const body = footerParts.length > 0 ? `${signed}\n\n--\n${footerParts.join('\n')}` : signed

  return {
    from: senderEmail(settings),
    fromName,
    replyTo: settings.reply_to?.trim() || null,
    subject,
    body,
  }
}
