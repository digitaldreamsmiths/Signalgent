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

/**
 * A MIME boundary. Deterministic from the message content rather than random,
 * because these helpers are meant to stay pure and unit-testable. It only has
 * to not occur inside the parts, which a hash-derived token won't.
 */
function boundaryFor(seed: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `=_sg_${h.toString(36)}${seed.length.toString(36)}`
}

/**
 * A part declaring `7bit` must actually BE 7-bit. Template copy routinely
 * carries curly quotes and accented names (anything pasted out of Word does),
 * and declaring 7bit while shipping UTF-8 is how those arrive as mojibake.
 * Base64 the part when it isn't pure ASCII; leave ASCII parts exactly as they
 * were, since that path has already delivered fine.
 */
function encodePart(text: string): { encoding: string; payload: string } {
  if (!/[^\x00-\x7F]/.test(text)) return { encoding: '7bit', payload: text }
  const b64 = Buffer.from(text, 'utf-8').toString('base64')
  return { encoding: 'base64', payload: (b64.match(/.{1,76}/g) ?? []).join('\r\n') }
}

/** RFC822 MIME for an outgoing message. Pass inReplyTo/references to thread a
 * follow-up into an existing conversation.
 *
 * With `htmlBody` the message becomes multipart/alternative: the plaintext part
 * is unchanged and is what most clients render, and the HTML alternative exists
 * so an open-tracking pixel has somewhere to live. Plaintext comes FIRST, as
 * the spec requires least-preferred-first.
 *
 * `listUnsubscribe` emits the RFC 2369 / RFC 8058 headers. These are what Gmail
 * and Outlook actually read when judging a bulk sender; a footer line without
 * them reads more like spam, not less. */
export function buildMessageMime(args: {
  from: string
  to: string
  subject: string
  replyTo: string | null
  body: string
  htmlBody?: string | null
  inReplyTo?: string | null
  references?: string | null
  listUnsubscribe?: string | null
  listUnsubscribePost?: string | null
}): string {
  const headers = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    'MIME-Version: 1.0',
  ]
  if (args.replyTo) headers.push(`Reply-To: ${args.replyTo}`)
  if (args.inReplyTo) headers.push(`In-Reply-To: ${args.inReplyTo}`)
  if (args.references) headers.push(`References: ${args.references}`)
  if (args.listUnsubscribe) headers.push(`List-Unsubscribe: ${args.listUnsubscribe}`)
  // Only meaningful alongside List-Unsubscribe, and only when an HTTPS POST
  // target was advertised — the caller decides that.
  if (args.listUnsubscribe && args.listUnsubscribePost) {
    headers.push(`List-Unsubscribe-Post: ${args.listUnsubscribePost}`)
  }

  const text = encodePart(args.body)

  if (!args.htmlBody) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      `Content-Transfer-Encoding: ${text.encoding}`,
      '',
      text.payload,
    ].join('\r\n')
  }

  const html = encodePart(args.htmlBody)
  const boundary = boundaryFor(`${args.to}|${args.subject}|${args.body.length}`)
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    `Content-Transfer-Encoding: ${text.encoding}`,
    '',
    text.payload,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    `Content-Transfer-Encoding: ${html.encoding}`,
    '',
    html.payload,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')
}
