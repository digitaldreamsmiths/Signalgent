import type { MicrosoftOAuthConfig } from './config'

const GRAPH = 'https://graph.microsoft.com/v1.0'

function tenantAuthority(config: MicrosoftOAuthConfig): string {
  return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0`
}

/** Scopes requested on connect. Mail.Read is what the reply/bounce scanner
 * needs; a mailbox connected before it was added keeps working for sending
 * (refresh uses the granted scope) but reports "needs reconnect" for scanning
 * until the user re-authorizes. */
export const OUTLOOK_SCOPES = 'offline_access User.Read Mail.Send Mail.Read'
/** Delegated permission the scanner requires. Compared against the scope string
 * Microsoft returned at connect time (which may omit the `offline_access` and
 * carry full `https://graph.microsoft.com/...` names, so match loosely). */
export const OUTLOOK_READ_SCOPE = 'Mail.Read'

export function hasOutlookScope(granted: string | null | undefined, scope: string): boolean {
  if (!granted) return false
  return granted.split(/\s+/).some((s) => s.split('/').pop()?.toLowerCase() === scope.toLowerCase())
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

export async function sendMail(accessToken: string, message: {
  to: string; subject: string; body: string; htmlBody?: string | null; replyTo?: string | null
}): Promise<void> {
  const response = await fetch(`${GRAPH}/me/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: message.htmlBody ? 'HTML' : 'Text', content: message.htmlBody ?? message.body },
        toRecipients: [{ emailAddress: { address: message.to } }],
        ...(message.replyTo ? { replyTo: [{ emailAddress: { address: message.replyTo } }] } : {}),
      },
      saveToSentItems: true,
    }),
  })
  if (!response.ok) throw new Error(`Microsoft send failed (${response.status})`)
}

// ── Mailbox reads (Mail.Read) ────────────────────────────────────────────────

export interface GraphEmailAddress { name?: string; address?: string }

/** The subset of a Graph message the scanner needs; fetched via $select so the
 * list stays small. `bodyPreview` is ~255 chars of plain text. */
export interface GraphMessage {
  id: string
  conversationId?: string
  subject?: string | null
  bodyPreview?: string | null
  receivedDateTime?: string
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
  const pageSize = Math.min(Math.max(args.pageSize ?? 100, 1), 1000)
  const maxPages = args.maxPages ?? 10
  const url = new URL(`${GRAPH}/me/messages`)
  url.search = new URLSearchParams({
    $filter: `receivedDateTime ge ${args.since}`,
    $orderby: 'receivedDateTime desc',
    $select: MESSAGE_SELECT,
    $top: String(pageSize),
  }).toString()
  const out: GraphMessage[] = []
  let next: string | undefined = url.toString()
  for (let page = 0; next && page < maxPages; page++) {
    const res: GraphListResponse = await graphGet<GraphListResponse>(accessToken, next)
    out.push(...(res.value ?? []))
    next = res['@odata.nextLink']
  }
  return out
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
