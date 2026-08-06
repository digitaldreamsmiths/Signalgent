/**
 * Open-tracking and unsubscribe URL construction, plus the plaintext → HTML
 * conversion that carries the tracking pixel.
 *
 * Why an HTML part at all: the outreach path sends `text/plain`, which is good
 * for deliverability but cannot carry a pixel. So a send becomes
 * multipart/alternative — the plaintext part stays exactly what it was and is
 * what most clients show, and the HTML alternative mirrors it with a 1x1 image
 * appended. `outreach_sends.body` continues to store the plaintext only; the
 * HTML is derived at send time and never persisted.
 *
 * What open data is and isn't worth: Apple Mail Privacy Protection prefetches
 * images, so some opens are the mail client rather than a person, and Gmail
 * proxies and caches the image, so repeat opens under-count. Treat a single
 * open as weak evidence. Treat the AGGREGATE as strong: a 0% open rate across
 * hundreds of sends means the mail is not being seen at all, which is a
 * different problem from copy nobody answers.
 *
 * Pure module (no DB, no network) so it stays trivially checkable.
 */

/** Base URL for tracking links. Returns null when unset, which disables
 * tracking rather than emitting a broken relative URL into a real email. */
export function appBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

export function openPixelUrl(token: string): string | null {
  const base = appBaseUrl()
  return base ? `${base}/api/outreach/open/${token}` : null
}

export function unsubscribeUrl(token: string): string | null {
  const base = appBaseUrl()
  return base ? `${base}/api/outreach/unsubscribe/${token}` : null
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Bare URLs and www./domain-style tokens that should become links in the HTML part. */
const LINKABLE = /\b((?:https?:\/\/|www\.)[^\s<>"]+|[a-z0-9-]+\.(?:io|com|net|org|gov)\b(?:\/[^\s<>"]*)?)/gi

/**
 * Mirror the plaintext body as minimal HTML: escaped text, newlines as <br>,
 * bare links made clickable, and the tracking pixel last.
 *
 * Deliberately styleless. A cold email that arrives looking like a designed
 * newsletter reads as bulk mail; this should look like what the plaintext part
 * looks like, which is a person typing in their mail client.
 */
export function textToHtml(text: string, pixelUrl?: string | null): string {
  const linked = escapeHtml(text).replace(LINKABLE, (m) => {
    const href = /^https?:\/\//i.test(m) ? m : `https://${m}`
    return `<a href="${href}">${m}</a>`
  })
  const body = linked.replace(/\r?\n/g, '<br>\n')
  // width/height AND style, because some clients ignore the attributes; alt=""
  // with a zero border keeps it from rendering as a broken-image placeholder.
  const pixel = pixelUrl
    ? `\n<img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" style="width:1px;height:1px;border:0;display:block" />`
    : ''
  return `<div style="white-space:normal;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#000">\n${body}${pixel}\n</div>`
}

/**
 * The RFC 2369 / RFC 8058 List-Unsubscribe pair. Gmail and Outlook read these
 * headers, not the footer line, when deciding whether a bulk sender is
 * behaving; a footer without the header actually reads MORE like spam.
 *
 * One-click (RFC 8058) is only advertised when there is an HTTPS URL to POST
 * to, since the spec requires the POST target. mailto is always included as
 * the fallback for clients that don't do one-click.
 */
export function listUnsubscribeHeaders(args: {
  url: string | null
  mailto: string | null
}): { listUnsubscribe: string; listUnsubscribePost: string | null } | null {
  const parts: string[] = []
  if (args.url) parts.push(`<${args.url}>`)
  if (args.mailto) parts.push(`<mailto:${args.mailto}?subject=unsubscribe>`)
  if (parts.length === 0) return null
  return {
    listUnsubscribe: parts.join(', '),
    listUnsubscribePost: args.url ? 'List-Unsubscribe=One-Click' : null,
  }
}
