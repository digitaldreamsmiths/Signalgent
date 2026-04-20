/**
 * Raw Gmail API access.
 *
 * Google OAuth primitives (authorize URL, code exchange, refresh, revoke)
 * moved to `lib/integrations/google/fetch.ts` in Session 10 so GA4 can
 * reuse them. This module now only contains Gmail-specific data reads.
 * OAuth entry points are re-exported below for the existing Gmail
 * connect/callback routes, which import them from here.
 *
 * This module knows nothing about our DB. It takes credentials as args and
 * returns raw Google response objects. Normalization happens in
 * lib/integrations/gmail/normalize.ts.
 */

import {
  buildAuthorizeUrl as buildGoogleAuthorizeUrl,
  exchangeCode as exchangeGoogleCode,
  refreshAccessToken as refreshGoogleAccessToken,
  revokeToken as revokeGoogleToken,
  type GoogleTokenResponse,
} from '../google/fetch'

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

/**
 * Gmail-specific authorize URL. Thin wrapper over the shared Google
 * helper — injects Gmail scopes so callers don't need to import two
 * modules.
 */
export function buildAuthorizeUrl(args: { state: string; redirectUri: string }): string {
  return buildGoogleAuthorizeUrl({
    state: args.state,
    redirectUri: args.redirectUri,
    scope: GMAIL_SCOPES,
  })
}

// Re-export shared OAuth helpers so consumers (callback route, disconnect
// flow) only need one import. These are the exact same functions from
// `lib/integrations/google/fetch.ts`.
export { exchangeGoogleCode as exchangeCode }
export { refreshGoogleAccessToken as refreshAccessToken }
export { revokeGoogleToken as revokeToken }
export type { GoogleTokenResponse }

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
