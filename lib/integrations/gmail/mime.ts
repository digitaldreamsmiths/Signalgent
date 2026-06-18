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

/** RFC822 MIME for a NEW (non-reply) plain-text message. */
export function buildMessageMime(args: {
  from: string
  to: string
  subject: string
  replyTo: string | null
  body: string
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
  lines.push('') // blank line separating headers from body
  lines.push(args.body)
  return lines.join('\r\n')
}
