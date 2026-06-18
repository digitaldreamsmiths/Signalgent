/**
 * Pure MIME helpers for Gmail sends. No imports beyond Node's Buffer so they
 * stay trivially unit-testable (no DB, no aliases, no network).
 */

export function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** RFC822 MIME for a plain-text message. Pass inReplyTo/references to thread a
 * follow-up into an existing conversation. */
export function buildMessageMime(args: {
  from: string
  to: string
  subject: string
  replyTo: string | null
  body: string
  inReplyTo?: string | null
  references?: string | null
}): string {
  const lines = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ]
  if (args.replyTo) lines.push(`Reply-To: ${args.replyTo}`)
  if (args.inReplyTo) lines.push(`In-Reply-To: ${args.inReplyTo}`)
  if (args.references) lines.push(`References: ${args.references}`)
  lines.push('') // blank line separating headers from body
  lines.push(args.body)
  return lines.join('\r\n')
}
