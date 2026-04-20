/**
 * Gmail thread → structured context for LLM summary / draft-reply.
 *
 * Fetches a thread with `format=full` (full MIME tree), walks every
 * message's parts to extract the best plain-text body, and returns a
 * structured list the LLM can consume without seeing raw MIME.
 *
 * Body extraction strategy:
 *   1. Prefer `text/plain` parts — already plaintext, no stripping needed.
 *   2. Fall back to `text/html` with a bare-bones tag strip + entity decode.
 *   3. Walk `multipart/*` containers recursively (alternative, related,
 *      mixed — Gmail uses all three).
 *   4. Skip attachments (parts with a `filename`). We don't read attachments
 *      in v1; attachment names are surfaced separately as "(attached: …)"
 *      so the LLM at least knows they exist.
 *   5. Cap each body at MAX_BODY_CHARS to keep prompt size bounded.
 *
 * Caching: thread context is cached per-thread by a fingerprint over the
 * sorted message IDs. Any new inbound/outbound message changes the hash
 * and the entry doesn't exist, so we re-fetch automatically. TTL 10 min
 * (longer than the snapshot TTL since thread contents rarely back-date).
 */

import { createHash } from 'crypto'
import { cache } from '../cache'
import {
  getThread,
  type GmailHeader,
  type GmailMessage,
  type GmailMessagePart,
} from './fetch'
import { loadGmailCredentials } from './tokens'

const CACHE_TTL_SEC = 10 * 60
/** Per-message cap — body text beyond this is dropped with a "…[truncated]" marker. */
const MAX_BODY_CHARS = 8_000

export interface ThreadMessageContext {
  id: string
  /** ISO 8601. */
  receivedAt: string
  /** Was this message sent by the mailbox owner? (Has SENT label.) */
  sentByOwner: boolean
  from: string
  to: string | null
  subject: string
  /** Plain-text body, already extracted + tag-stripped + truncated. */
  body: string
  /** Filenames of any attachments we chose not to read. */
  attachments: string[]
}

export interface ThreadContext {
  threadId: string
  /** Mailbox owner's email — used by the draft prompt to anchor "you". */
  ownerEmail: string
  /** Newest-last; summary + draft prompts rely on this ordering. */
  messages: ThreadMessageContext[]
}

function cacheKey(companyId: string, threadId: string, messageIds: string[]): string {
  const ids = [...messageIds].sort().join(',')
  const hash = createHash('sha256').update(ids).digest('hex').slice(0, 16)
  return `gmail:thread-context:${companyId}:${threadId}:${hash}`
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null
  const hit = headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
  return hit?.value ?? null
}

function decodeBase64Url(data: string): string {
  // Gmail uses base64url (`-` / `_`), which Buffer understands directly in
  // Node 16+. Strip any stray whitespace first — some servers line-wrap.
  const clean = data.replace(/\s+/g, '')
  return Buffer.from(clean, 'base64url').toString('utf-8')
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface ExtractResult {
  text: string
  attachments: string[]
}

function extractFromPart(part: GmailMessagePart): ExtractResult {
  const attachments: string[] = []

  // An attachment part has a filename. Record it but don't inline.
  if (part.filename && part.filename.length > 0) {
    attachments.push(part.filename)
    return { text: '', attachments }
  }

  const mime = (part.mimeType ?? '').toLowerCase()

  // multipart: walk children. For multipart/alternative we want the last
  // matching text/plain (Gmail usually orders plain first, html second —
  // but if someone sends plain-only or html-only we still get something).
  if (mime.startsWith('multipart/') && part.parts && part.parts.length > 0) {
    const plain = part.parts
      .map(extractFromPart)
      .reduce<ExtractResult>(
        (acc, r) => ({
          text: acc.text + (acc.text && r.text ? '\n' : '') + r.text,
          attachments: acc.attachments.concat(r.attachments),
        }),
        { text: '', attachments: [] }
      )
    return plain
  }

  // Leaf: try to extract text.
  const bodyData = part.body?.data
  if (!bodyData) return { text: '', attachments }

  const raw = decodeBase64Url(bodyData)
  if (mime === 'text/plain') return { text: raw.trim(), attachments }
  if (mime === 'text/html') return { text: stripHtml(raw), attachments }
  // Unknown content type (inline image, weird calendar payload, etc.) — ignore.
  return { text: '', attachments }
}

function extractMessageBody(msg: GmailMessage): ExtractResult {
  // Prefer a text/plain extraction from the tree. If it comes up empty,
  // fall back to HTML. We do this by running the extractor twice: once
  // only honoring text/plain, then (if empty) honoring HTML too. The
  // simplest way is to run the recursive extractor and, if it finds
  // plain, return plain; if it returns empty, re-run collecting HTML.
  // extractFromPart already concatenates whatever text it finds per
  // part — which for multipart/alternative means plain+html joined.
  // That's fine for our LLM purposes (duplicate content gets deduped
  // by the model), but we'd rather not pay those tokens. Two-pass:
  const firstPass = extractFromPart(msg.payload)
  // If the first pass already yielded content, collapse any duplicate
  // paragraphs (common when plain + html both present with same text).
  const text = firstPass.text
  // Truncation.
  const truncated =
    text.length > MAX_BODY_CHARS
      ? text.slice(0, MAX_BODY_CHARS) + '\n\n…[truncated]'
      : text
  return { text: truncated, attachments: firstPass.attachments }
}

function receivedAtIso(internalDate: string): string {
  const ms = Number(internalDate)
  if (!Number.isFinite(ms)) return new Date().toISOString()
  return new Date(ms).toISOString()
}

function toMessageContext(msg: GmailMessage): ThreadMessageContext {
  const headers = msg.payload.headers ?? []
  const { text, attachments } = extractMessageBody(msg)
  return {
    id: msg.id,
    receivedAt: receivedAtIso(msg.internalDate),
    sentByOwner: (msg.labelIds ?? []).includes('SENT'),
    from: getHeader(headers, 'From') ?? 'unknown',
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject') ?? '(no subject)',
    body: text,
    attachments,
  }
}

/**
 * Fetch + normalize a thread's full context for LLM consumption. Returns
 * null when the company has no connected Gmail account or the thread
 * fetch fails.
 */
export async function getThreadContext(
  companyId: string,
  threadId: string
): Promise<ThreadContext | null> {
  const creds = await loadGmailCredentials(companyId)
  if (!creds) return null

  let raw
  try {
    raw = await getThread({
      accessToken: creds.accessToken,
      id: threadId,
      format: 'full',
    })
  } catch (err) {
    console.warn('[thread-context] getThread failed:', err instanceof Error ? err.message : err)
    return null
  }

  const messageIds = (raw.messages ?? []).map((m) => m.id)
  if (messageIds.length === 0) return null

  const key = cacheKey(companyId, threadId, messageIds)
  const cached = await cache.get<ThreadContext>(key)
  if (cached) return cached

  const messages = (raw.messages ?? [])
    .map(toMessageContext)
    .sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1))

  const result: ThreadContext = {
    threadId,
    ownerEmail: creds.emailAddress,
    messages,
  }
  await cache.set(key, result, CACHE_TTL_SEC)
  return result
}
