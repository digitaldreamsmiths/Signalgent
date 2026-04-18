import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SERVICE_ENV_VARS, type ServiceId } from '@/lib/integrations/services'

function getBaseUrl(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) return `https://${forwardedHost}`
  const { origin } = new URL(request.url)
  return origin
}

function redirectWithError(base: string, error: string) {
  return NextResponse.redirect(`${base}/settings/connections?error=${error}`)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const baseUrl = getBaseUrl(request)

  if (!code || !stateParam) {
    return redirectWithError(baseUrl, 'missing_code_or_state')
  }

  // Validate CSRF state
  const cookies = request.headers.get('cookie') ?? ''
  const cookieMatch = cookies.match(new RegExp(`oauth_state_${service}=([^;]+)`))
  if (!cookieMatch || cookieMatch[1] !== stateParam) {
    return redirectWithError(baseUrl, 'invalid_state')
  }

  let parsed: { companyId: string; userId: string; shop?: string }
  try {
    parsed = JSON.parse(Buffer.from(stateParam, 'base64').toString())
  } catch {
    return redirectWithError(baseUrl, 'invalid_state_payload')
  }

  const { companyId, userId, shop } = parsed

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== userId) {
    return redirectWithError(baseUrl, 'unauthorized')
  }

  const serviceId = service as ServiceId
  const envVars = SERVICE_ENV_VARS[serviceId]
  if (!envVars) {
    return redirectWithError(baseUrl, 'unsupported_service')
  }

  const clientId = process.env[envVars.clientId]
  const clientSecret = process.env[envVars.clientSecret]
  if (!clientId || !clientSecret) {
    return redirectWithError(baseUrl, 'service_not_configured')
  }

  const callbackUrl = `${baseUrl}/api/integrations/${service}/callback`

  // ── Shopify token exchange ─────────────────────────────────────────────────
  let tokenData: Record<string, string> = {}
  let accountIdentifier: string | null = null

  if (serviceId === 'shopify' && shop) {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })
    if (!res.ok) return redirectWithError(baseUrl, 'shopify_token_exchange_failed')
    tokenData = await res.json()
    accountIdentifier = shop
  }

  // ── Google token exchange (Gmail + GA4) ───────────────────────────────────
  else if (serviceId === 'gmail' || serviceId === 'google_analytics') {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) return redirectWithError(baseUrl, 'google_token_exchange_failed')
    tokenData = await res.json()

    // Get email for account_identifier
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (infoRes.ok) {
      const info = await infoRes.json()
      accountIdentifier = info.email ?? null
    }
  }

  // ── Microsoft token exchange (Outlook) ────────────────────────────────────
  else if (serviceId === 'outlook') {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) return redirectWithError(baseUrl, 'microsoft_token_exchange_failed')
    tokenData = await res.json()

    const infoRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (infoRes.ok) {
      const info = await infoRes.json()
      accountIdentifier = info.mail ?? info.userPrincipalName ?? null
    }
  }

  // ── LinkedIn token exchange ───────────────────────────────────────────────
  else if (serviceId === 'linkedin_page') {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) return redirectWithError(baseUrl, 'linkedin_token_exchange_failed')
    tokenData = await res.json()
  }

  // ── Facebook token exchange ───────────────────────────────────────────────
  else if (serviceId === 'facebook_page') {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&client_secret=${clientSecret}&code=${code}`
    )
    if (!res.ok) return redirectWithError(baseUrl, 'facebook_token_exchange_failed')
    tokenData = await res.json()
  }

  // ── Stripe Connect token exchange ─────────────────────────────────────────
  else if (serviceId === 'stripe_account') {
    const res = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) return redirectWithError(baseUrl, 'stripe_token_exchange_failed')
    tokenData = await res.json()
    accountIdentifier = (tokenData as Record<string, string>).stripe_user_id ?? null
  }

  // ── QuickBooks token exchange ─────────────────────────────────────────────
  else if (serviceId === 'quickbooks') {
    const realmId = searchParams.get('realmId')
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) return redirectWithError(baseUrl, 'quickbooks_token_exchange_failed')
    tokenData = await res.json()
    accountIdentifier = realmId ?? null
  }

  // ── Persist to connected_accounts ─────────────────────────────────────────
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
    : null

  const { error: upsertError } = await supabase.from('connected_accounts').upsert(
    {
      company_id: companyId,
      service: serviceId,
      access_token: tokenData.access_token ?? null,
      refresh_token: tokenData.refresh_token ?? null,
      token_expires_at: expiresAt,
      scope: tokenData.scope ?? null,
      account_identifier: accountIdentifier,
      metadata: shop ? { shop } : {},
      status: 'connected',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,service' }
  )

  if (upsertError) {
    return redirectWithError(baseUrl, 'db_error')
  }

  // Clear state cookie and redirect to connections page
  const response = NextResponse.redirect(`${baseUrl}/settings/connections?connected=${service}`)
  response.cookies.set(`oauth_state_${service}`, '', { maxAge: 0, path: '/' })
  return response
}
