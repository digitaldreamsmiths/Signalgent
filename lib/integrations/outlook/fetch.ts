import type { MicrosoftOAuthConfig } from './config'

const GRAPH = 'https://graph.microsoft.com/v1.0'

function tenantAuthority(config: MicrosoftOAuthConfig): string {
  return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0`
}

/** Scopes requested on connect.
 *  - Mail.Send: the plain sendMail path.
 *  - Mail.ReadWrite: reading the mailbox (reply/bounce scanner) AND creating
 *    drafts, which is the only way Graph lets us thread a follow-up under an
 *    earlier send (createReply). It supersedes Mail.Read.
 * A mailbox connected before a scope was added keeps working for whatever its
 * granted scope allows (refresh uses the granted scope, see refreshToken);
 * callers probe with canReadMail / canThreadMail and degrade. */
export const OUTLOOK_SCOPES = 'offline_access User.Read Mail.Send Mail.ReadWrite'

/** Compared against the scope string Microsoft returned at connect time, which
 * may omit `offline_access` and carry full `https://graph.microsoft.com/...`
 * names, so match on the last path segment. */
export function hasOutlookScope(granted: string | null | undefined, scope: string): boolean {
  if (!granted) return false
  return granted.split(/\s+/).some((s) => s.split('/').pop()?.toLowerCase() === scope.toLowerCase())
}
/** Mailbox can be read (scanner, sent-item lookup). */
export function canReadMail(granted: string | null | undefined): boolean {
  return hasOutlookScope(granted, 'Mail.Read') || hasOutlookScope(granted, 'Mail.ReadWrite')
}
/** Drafts can be created, so sends return ids and follow-ups can thread. */
export function canThreadMail(granted: string | null | undefined): boolean {
  return hasOutlookScope(granted, 'Mail.ReadWrite')
}

export function authorizeUrl(state: string, redirectUri: string, config: MicrosoftOAuthConfig): string {
  const url = new URL(`${tenantAuthority(config)}/authorize`)
  url.search = new URLSearchParams({
    client_id: config.clientId, response_type: 'code', redirect_uri: redirectUri,
    response_mode: 'query', scope: OUTLOOK_SCOPES, state,
    prompt: 'select_account',
  }).toString()
  return url.toString()
}

export interface MicrosoftTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
}

async function tokenRequest(form: URLSearchParams, config: MicrosoftOAuthConfig): Promise<MicrosoftTokens> {
  const response = await fetch(`${tenantAuthority(config)}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  if (!response.ok) throw new Error(`Microsoft token exchange failed (${response.status})`)
  const tokens = await response.json() as MicrosoftTokens
  if (!tokens.access_token || !tokens.expires_in) throw new Error('Microsoft did not return an access token')
  return tokens
}

export async function exchangeCode(code: string, redirectUri: string, config: MicrosoftOAuthConfig): Promise<MicrosoftTokens> {
  return tokenRequest(new URLSearchParams({
    client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: redirectUri,
    grant_type: 'authorization_code', scope: OUTLOOK_SCOPES,
  }), config)
}

/** Refresh with the scope the user actually granted (`grantedScope`), not the
 * current OUTLOOK_SCOPES: Microsoft rejects a refresh that asks for a scope the
 * user never consented to, which would break sending for a mailbox connected
 * before a new scope was added. Falls back to OUTLOOK_SCOPES when unknown. */
export async function refreshToken(refresh: string, config: MicrosoftOAuthConfig, grantedScope?: string | null): Promise<MicrosoftTokens> {
  const scope = grantedScope?.trim() ? grantedScope.trim() : OUTLOOK_SCOPES
  return tokenRequest(new URLSearchParams({
    client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refresh,
    grant_type: 'refresh_token', scope,
  }), config)
}

export async function mailboxProfile(accessToken: string): Promise<{ mail: string | null; userPrincipalName: string }> {
  const response = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error(`Microsoft mailbox profile failed (${response.status})`)
  return response.json()
}

export interface OutgoingMail {
  to: string; subject: string; body: string; htmlBody?: string | null; replyTo?: string | null
}

/** Ids of a message we sent, as far as the send path could learn them. Null
 * fields mean Graph did not tell us (the plain sendMail path returns nothing)
 * and a later Sent Items lookup may still fill them in. */
export interface SentMessageRefs {
  /** Graph message id (immutable, see IMMUTABLE_ID). */
  id: string | null
  conversationId: string | null
  /** RFC 5322 Message-ID, with angle brackets. */
  internetMessageId: string | null
}

/** Graph ids change when a message moves folders (Drafts -> Sent Items) unless
 * this header is sent; with it the id we store at draft time stays valid. */
const IMMUTABLE_ID = { Prefer: 'IdType="ImmutableId"' }

function graphMessageBody(message: OutgoingMail) {
  return {
    subject: message.subject,
    body: { contentType: message.htmlBody ? 'HTML' : 'Text', content: message.htmlBody ?? message.body },
    toRecipients: [{ emailAddress: { address: message.to } }],
    ...(message.replyTo ? { replyTo: [{ emailAddress: { address: message.replyTo } }] } : {}),
  }
}

async function graphSend(accessToken: string, url: string, method: 'POST' | 'PATCH', body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Microsoft send failed (${response.status})`)
  return response
}

/** Fire-and-forget send (Mail.Send only). Graph returns 202 with no body, so
 * the caller learns no ids; see findSentCopy for recovering them afterwards. */
export async function sendMail(accessToken: string, message: OutgoingMail): Promise<void> {
  await graphSend(accessToken, `${GRAPH}/me/sendMail`, 'POST', { message: graphMessageBody(message), saveToSentItems: true })
}

/** Create a draft, then send it (Mail.ReadWrite + Mail.Send). Two calls instead
 * of one, in exchange for the message id, conversation id and Message-ID that
 * let a later touch reply into the same thread. */
export async function sendMailWithRefs(accessToken: string, message: OutgoingMail): Promise<SentMessageRefs> {
  const draft = await graphSend(accessToken, `${GRAPH}/me/messages`, 'POST', graphMessageBody(message), IMMUTABLE_ID)
  const created = await draft.json() as { id: string; conversationId?: string; internetMessageId?: string }
  await graphSend(accessToken, `${GRAPH}/me/messages/${encodeURIComponent(created.id)}/send`, 'POST')
  return { id: created.id, conversationId: created.conversationId ?? null, internetMessageId: created.internetMessageId ?? null }
}

/**
 * Send `message` as a reply to one of OUR earlier sent messages, so the mail
 * client threads it (Graph writes In-Reply-To / References and keeps the
 * conversation id; sendMail cannot set those headers). createReply addresses
 * the original's sender, i.e. us, so the recipient is reset to the prospect
 * and the quoted original is replaced by our body.
 */
export async function sendReply(accessToken: string, originalMessageId: string, message: OutgoingMail): Promise<SentMessageRefs> {
  const reply = await graphSend(accessToken, `${GRAPH}/me/messages/${encodeURIComponent(originalMessageId)}/createReply`, 'POST', {}, IMMUTABLE_ID)
  const draft = await reply.json() as { id: string; conversationId?: string }
  const patched = await graphSend(accessToken, `${GRAPH}/me/messages/${encodeURIComponent(draft.id)}`, 'PATCH', graphMessageBody(message), IMMUTABLE_ID)
  const updated = await patched.json() as { internetMessageId?: string; conversationId?: string }
  await graphSend(accessToken, `${GRAPH}/me/messages/${encodeURIComponent(draft.id)}/send`, 'POST')
  return {
    id: draft.id,
    conversationId: updated.conversationId ?? draft.conversationId ?? null,
    internetMessageId: updated.internetMessageId ?? null,
  }
}

// ── Mailbox reads (Mail.Read) ────────────────────────────────────────────────

export interface GraphEmailAddress { name?: string; address?: string }

/** The subset of a Graph message the scanner needs; fetched via $select so the
 * list stays small. `bodyPreview` is ~255 chars of plain text. */
export interface GraphMessage {
  id: string
  conversationId?: string
  internetMessageId?: string
  subject?: string | null
  bodyPreview?: string | null
  receivedDateTime?: string
  sentDateTime?: string
  isDraft?: boolean
  from?: { emailAddress?: GraphEmailAddress } | null
  sender?: { emailAddress?: GraphEmailAddress } | null
  toRecipients?: { emailAddress?: GraphEmailAddress }[]
}

interface GraphListResponse { value: GraphMessage[]; '@odata.nextLink'?: string }

const MESSAGE_SELECT = 'id,conversationId,subject,bodyPreview,receivedDateTime,isDraft,from,sender,toRecipients'

async function graphGet<T>(accessToken: string, url: string, extraHeaders: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, ...extraHeaders } })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Microsoft Graph ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
  return response.json() as Promise<T>
}

/** True for the 401/403 Graph returns when the token lacks Mail.Read. */
export function isGraphForbidden(err: unknown): boolean {
  return err instanceof Error && /Microsoft Graph 40[13]\b/.test(err.message)
}

/**
 * List messages received since `since`, newest first, across ALL folders (so a
 * bounce the user already deleted, or a reply Outlook filed under Junk or
 * Archive, is still seen). Pages via @odata.nextLink up to `maxPages`.
 */
export async function listMessagesSince(accessToken: string, args: { since: string; pageSize?: number; maxPages?: number }): Promise<GraphMessage[]> {
  return listPaged(accessToken, `${GRAPH}/me/messages`, {
    $filter: `receivedDateTime ge ${args.since}`,
    $orderby: 'receivedDateTime desc',
    $select: MESSAGE_SELECT,
  }, args)
}

/** Our own sent mail since `since`, newest first, with the ids a later touch
 * needs to thread under it. Ids are immutable (IMMUTABLE_ID). */
export async function listSentSince(accessToken: string, args: { since: string; pageSize?: number; maxPages?: number }): Promise<GraphMessage[]> {
  return listPaged(accessToken, `${GRAPH}/me/mailFolders/sentitems/messages`, {
    $filter: `sentDateTime ge ${args.since}`,
    $orderby: 'sentDateTime desc',
    $select: 'id,conversationId,internetMessageId,subject,toRecipients,sentDateTime',
  }, args, IMMUTABLE_ID)
}

async function listPaged(
  accessToken: string,
  base: string,
  query: Record<string, string>,
  args: { pageSize?: number; maxPages?: number },
  extraHeaders: Record<string, string> = {},
): Promise<GraphMessage[]> {
  const pageSize = Math.min(Math.max(args.pageSize ?? 100, 1), 1000)
  const maxPages = args.maxPages ?? 10
  const url = new URL(base)
  url.search = new URLSearchParams({ ...query, $top: String(pageSize) }).toString()
  const out: GraphMessage[] = []
  let next: string | undefined = url.toString()
  for (let page = 0; next && page < maxPages; page++) {
    const res: GraphListResponse = await graphGet<GraphListResponse>(accessToken, next, extraHeaders)
    out.push(...(res.value ?? []))
    next = res['@odata.nextLink']
  }
  return out
}

/** Locate one of our messages by its RFC 5322 Message-ID (stored on the send
 * row as message_id_header). Returns the immutable Graph id, or null. */
export async function findMessageByInternetId(accessToken: string, internetMessageId: string): Promise<{ id: string; conversationId: string | null } | null> {
  const url = new URL(`${GRAPH}/me/messages`)
  url.search = new URLSearchParams({
    $filter: `internetMessageId eq '${internetMessageId.replace(/'/g, "''")}'`,
    $select: 'id,conversationId',
    $top: '1',
  }).toString()
  const res = await graphGet<GraphListResponse>(accessToken, url.toString(), IMMUTABLE_ID)
  const hit = res.value?.[0]
  return hit ? { id: hit.id, conversationId: hit.conversationId ?? null } : null
}

/**
 * Recover the ids of a message sent through the plain sendMail path by finding
 * its Sent Items copy: same recipient and subject, sent within `windowMs` of
 * `sentAt`. Exchange files the copy asynchronously, so callers that ask right
 * after sending should retry briefly. Null when nothing matches.
 */
export async function findSentCopy(accessToken: string, args: { to: string; subject: string; sentAt: Date; windowMs?: number }): Promise<SentMessageRefs | null> {
  const windowMs = args.windowMs ?? 10 * 60_000
  const since = new Date(args.sentAt.getTime() - windowMs).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const candidates = await listSentSince(accessToken, { since, pageSize: 50, maxPages: 2 })
  return matchSentCopy(candidates, args)
}

/** Pure matcher shared by findSentCopy and the thread backfill. */
export function matchSentCopy(candidates: GraphMessage[], args: { to: string; subject: string; sentAt: Date; windowMs?: number }): SentMessageRefs | null {
  const windowMs = args.windowMs ?? 10 * 60_000
  const to = args.to.trim().toLowerCase()
  const subject = args.subject.trim().toLowerCase()
  let best: { diff: number; m: GraphMessage } | null = null
  for (const m of candidates) {
    if ((m.subject ?? '').trim().toLowerCase() !== subject) continue
    if (!(m.toRecipients ?? []).some((r) => (r.emailAddress?.address ?? '').toLowerCase() === to)) continue
    const t = m.sentDateTime ? Date.parse(m.sentDateTime) : NaN
    if (!Number.isFinite(t)) continue
    const diff = Math.abs(t - args.sentAt.getTime())
    if (diff > windowMs) continue
    if (!best || diff < best.diff) best = { diff, m }
  }
  if (!best) return null
  return { id: best.m.id, conversationId: best.m.conversationId ?? null, internetMessageId: best.m.internetMessageId ?? null }
}

/** Plain-text body of one message. Used only for delivery notices, where the
 * failed recipient's address lives in the body rather than the headers. */
export async function getMessageText(accessToken: string, id: string): Promise<string> {
  const url = `${GRAPH}/me/messages/${encodeURIComponent(id)}?$select=body`
  const res = await graphGet<{ body?: { contentType?: string; content?: string } }>(accessToken, url, {
    Prefer: 'outlook.body-content-type="text"',
  })
  const content = res.body?.content ?? ''
  // Graph honours the Prefer header, but strip tags anyway in case it didn't.
  return res.body?.contentType?.toLowerCase() === 'html' ? content.replace(/<[^>]+>/g, ' ') : content
}
