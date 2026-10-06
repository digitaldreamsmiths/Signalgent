const GRAPH = 'https://graph.microsoft.com/v1.0'

function tenantAuthority(): string {
  // The app registration accepts work accounts from multiple Entra tenants.
  return 'https://login.microsoftonline.com/organizations/oauth2/v2.0'
}

function appCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Microsoft mailbox credentials are not configured')
  return { clientId, clientSecret }
}

export const OUTLOOK_SCOPES = 'offline_access User.Read Mail.Send'

export function authorizeUrl(state: string, redirectUri: string): string {
  const { clientId } = appCredentials()
  const url = new URL(`${tenantAuthority()}/authorize`)
  url.search = new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
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

async function tokenRequest(form: URLSearchParams): Promise<MicrosoftTokens> {
  const response = await fetch(`${tenantAuthority()}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  if (!response.ok) throw new Error(`Microsoft token exchange failed (${response.status})`)
  const tokens = await response.json() as MicrosoftTokens
  if (!tokens.access_token || !tokens.expires_in) throw new Error('Microsoft did not return an access token')
  return tokens
}

export async function exchangeCode(code: string, redirectUri: string): Promise<MicrosoftTokens> {
  const { clientId, clientSecret } = appCredentials()
  return tokenRequest(new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri,
    grant_type: 'authorization_code', scope: OUTLOOK_SCOPES,
  }))
}

export async function refreshToken(refresh: string): Promise<MicrosoftTokens> {
  const { clientId, clientSecret } = appCredentials()
  return tokenRequest(new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, refresh_token: refresh,
    grant_type: 'refresh_token', scope: OUTLOOK_SCOPES,
  }))
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
