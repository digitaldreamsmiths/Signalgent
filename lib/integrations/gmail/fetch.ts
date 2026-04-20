/**
 * Raw Gmail / Google OAuth API access.
 *
 * Two kinds of calls live here:
 *   1. Google OAuth: authorize URL, code → token exchange, refresh, revoke.
 *   2. Gmail data reads on behalf of a connected account (that account's
 *      access token).
 *
 * This module knows nothing about our DB. It takes credentials as args and
 * returns raw Google response objects. Normalization happens in
 * lib/integrations/gmail/normalize.ts.
 */

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'

/**
 * Scopes requested at authorization time. Keep in sync with Google Cloud
 * Console → Google Auth Platform → Data Access.
 *
 * Only `gmail.readonly` is requested. The mailbox email address comes from
 * Gmail's own `users.getProfile` endpoint (no separate userinfo call), so
 * we avoid pulling in OIDC scopes like `openid`/`email` that Google auto-
 * expands from `userinfo.email` and that must otherwise be mirrored in
 * the consent screen's Data Access list.
 */
export const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly'

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID
  if (!v) {
    throw new Error('GOOGLE_CLIENT_ID is not set. Get it from Google Cloud Console > APIs & Services > Credentials.')
  }
  return v
}

function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET
  if (!v) {
    throw new Error('GOOGLE_CLIENT_SECRET is not set. Get it from Google Cloud Console > APIs & Services > Credentials.')
  }
  return v
}

/**
 * Build the Google OAuth authorize URL. `access_type=offline` + `prompt=consent`
 * are required to receive a refresh token (Google only returns a refresh token
 * on first consent unless prompt=consent forces re-issue).
 */
export function buildAuthorizeUrl(args: { state: string; redirectUri: string }): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('redirect_uri', args.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GMAIL_SCOPES)
  url.searchParams.set('state', args.state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  return url.toString()
}

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number // seconds
  scope: string
  token_type: string // 'Bearer'
  id_token?: string
}

/**
 * Exchange an authorization code for access + refresh tokens. The caller
 * passes the same redirectUri used on the authorize step; Google validates
 * it matches.
 */
export async function exchangeCode(args: {
  code: string
  redirectUri: string
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: args.code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: args.redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as GoogleTokenResponse
}

/**
 * Refresh an access token using a long-lived refresh token. Google access
 * tokens expire after ~1 hour; we refresh transparently whenever we detect
 * an about-to-expire token.
 *
 * Note: the response does NOT include a new refresh_token. The original
 * refresh token continues to work until explicitly revoked.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
  scope: string
  token_type: string
}> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${text}`)
  }
  return JSON.parse(text)
}

/**
 * Revoke a token at Google. Accepts either an access or refresh token.
 * Best-effort: callers proceed with local cleanup regardless of outcome.
 */
export async function revokeToken(token: string): Promise<void> {
  const res = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn(`Google revoke returned ${res.status}: ${text}`)
  }
}

// ------------------------------------------------------------------
// Gmail reads
// ------------------------------------------------------------------

export interface GmailProfile {
  emailAddress: string
  messagesTotal: number
  threadsTotal: number
  historyId: string
}

export async function getGmailProfile(accessToken: string): Promise<GmailProfile> {
  const res = await fetch(`${GMAIL_API}/users/me/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Gmail profile failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as GmailProfile
}

export interface GmailMessageRef {
  id: string
  threadId: string
}

export interface GmailMessageListResponse {
  messages?: GmailMessageRef[]
  nextPageToken?: string
  resultSizeEstimate: number
}

/**
 * List messages matching a Gmail search query. `q` follows the Gmail search
 * DSL (e.g. "is:unread", "newer_than:7d in:inbox"). Returns message + thread
 * IDs only — the full message must be fetched separately.
 */
export async function listMessages(args: {
  accessToken: string
  q?: string
  maxResults?: number
  pageToken?: string
  labelIds?: string[]
}): Promise<GmailMessageListResponse> {
  const params = new URLSearchParams()
  params.set('maxResults', String(args.maxResults ?? 20))
  if (args.q) params.set('q', args.q)
  if (args.pageToken) params.set('pageToken', args.pageToken)
  for (const label of args.labelIds ?? []) {
    params.append('labelIds', label)
  }

  const res = await fetch(`${GMAIL_API}/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Gmail list messages failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as GmailMessageListResponse
}

export interface GmailHeader {
  name: string
  value: string
}

/**
 * One node in Gmail's MIME tree. `format=full` returns the full tree;
 * `format=minimal`/`metadata` return only the outer payload with headers
 * (and for metadata, `parts` may be present but `body.data` is absent).
 *
 * Bodies are base64url-encoded (Gmail's non-standard variant with `-` and
 * `_` instead of `+` and `/`). The MIME extractor decodes from there.
 */
export interface GmailMessagePart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: {
    size: number
    data?: string // base64url — only present when format=full
    attachmentId?: string
  }
  parts?: GmailMessagePart[]
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet: string
  internalDate: string // unix ms as string
  payload: GmailMessagePart & {
    headers: GmailHeader[]
  }
  sizeEstimate?: number
}

/**
 * Fetch a single message. `format=metadata` is efficient for a list view —
 * only returns headers (From/Subject/Date) + snippet, not the body.
 */
export async function getMessage(args: {
  accessToken: string
  id: string
  format?: 'metadata' | 'full' | 'minimal'
  metadataHeaders?: string[]
}): Promise<GmailMessage> {
  const format = args.format ?? 'metadata'
  const params = new URLSearchParams({ format })
  if (format === 'metadata') {
    const headers = args.metadataHeaders ?? ['From', 'Subject', 'Date', 'To']
    for (const h of headers) params.append('metadataHeaders', h)
  }

  const res = await fetch(`${GMAIL_API}/users/me/messages/${args.id}?${params}`, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Gmail get message failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as GmailMessage
}

export interface GmailThreadRef {
  id: string
  historyId?: string
  snippet?: string
}

export interface GmailThreadListResponse {
  threads?: GmailThreadRef[]
  nextPageToken?: string
  resultSizeEstimate: number
}

/**
 * List threads matching a Gmail search query. Uses the same DSL as
 * listMessages. Returns thread IDs only — the full thread (with all
 * messages) must be fetched separately via getThread.
 */
export async function listThreads(args: {
  accessToken: string
  q?: string
  maxResults?: number
  pageToken?: string
  labelIds?: string[]
}): Promise<GmailThreadListResponse> {
  const params = new URLSearchParams()
  params.set('maxResults', String(args.maxResults ?? 100))
  if (args.q) params.set('q', args.q)
  if (args.pageToken) params.set('pageToken', args.pageToken)
  for (const label of args.labelIds ?? []) {
    params.append('labelIds', label)
  }

  const res = await fetch(`${GMAIL_API}/users/me/threads?${params}`, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Gmail list threads failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as GmailThreadListResponse
}

export interface GmailThread {
  id: string
  historyId: string
  messages: GmailMessage[]
}

/**
 * Fetch a single thread with every message inline. `format=minimal` returns
 * each message's `internalDate` + `labelIds` without payload/headers — the
 * cheapest format that still lets us do timing + direction analysis.
 */
export async function getThread(args: {
  accessToken: string
  id: string
  format?: 'metadata' | 'full' | 'minimal'
  metadataHeaders?: string[]
}): Promise<GmailThread> {
  const format = args.format ?? 'minimal'
  const params = new URLSearchParams({ format })
  if (format === 'metadata') {
    const headers = args.metadataHeaders ?? ['From', 'Subject', 'Date', 'To']
    for (const h of headers) params.append('metadataHeaders', h)
  }

  const res = await fetch(`${GMAIL_API}/users/me/threads/${args.id}?${params}`, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Gmail get thread failed (${res.status}): ${text}`)
  }
  return JSON.parse(text) as GmailThread
}
