import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { OAUTH_URLS, OAUTH_SCOPES, SERVICE_ENV_VARS, type ServiceId } from '@/lib/integrations/services'

function getBaseUrl(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) return `https://${forwardedHost}`
  const { origin } = new URL(request.url)
  return origin
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')
  const shop = searchParams.get('shop') // Shopify only

  if (!companyId) {
    return NextResponse.json({ error: 'missing_company_id' }, { status: 400 })
  }

  // Verify the user is authenticated and has access to this company
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .single()

  if (!company) {
    return NextResponse.json({ error: 'company_not_found' }, { status: 404 })
  }

  const serviceId = service as ServiceId
  const baseUrl = getBaseUrl(request)
  const callbackUrl = `${baseUrl}/api/integrations/${service}/callback`

  // ── Shopify (requires shop domain) ────────────────────────────────────────
  if (serviceId === 'shopify') {
    const clientId = process.env.SHOPIFY_CLIENT_ID
    if (!clientId || !shop) {
      return NextResponse.json(
        { error: !clientId ? 'shopify_not_configured' : 'missing_shop_domain' },
        { status: 400 }
      )
    }
    const shopDomain = shop.replace(/https?:\/\//, '').replace(/\/$/, '')
    const state = Buffer.from(JSON.stringify({ companyId, userId: user.id, shop: shopDomain })).toString('base64')
    const scopes = 'read_products,read_orders,read_inventory,write_products'
    const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`
    const response = NextResponse.redirect(authUrl)
    response.cookies.set(`oauth_state_${service}`, state, { httpOnly: true, maxAge: 600, path: '/' })
    return response
  }

  // ── Plaid (Link SDK — not a standard redirect flow) ───────────────────────
  if (serviceId === 'plaid') {
    return NextResponse.json({ error: 'plaid_uses_link_sdk' }, { status: 400 })
  }

  // ── Standard OAuth (Google, Microsoft, LinkedIn, Facebook, Stripe, QuickBooks) ──
  const oauthUrl = OAUTH_URLS[serviceId]
  const envVars = SERVICE_ENV_VARS[serviceId]

  if (!oauthUrl || !envVars) {
    return NextResponse.json({ error: 'unsupported_service' }, { status: 400 })
  }

  const clientId = process.env[envVars.clientId]
  if (!clientId) {
    return NextResponse.json({ error: `${envVars.clientId}_not_configured` }, { status: 503 })
  }

  // CSRF state
  const state = Buffer.from(JSON.stringify({ companyId, userId: user.id })).toString('base64')

  const params_url = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    state,
    ...(OAUTH_SCOPES[serviceId] ? { scope: OAUTH_SCOPES[serviceId]! } : {}),
    // Google-specific: request offline access for refresh token
    ...(service === 'gmail' || service === 'google_analytics'
      ? { access_type: 'offline', prompt: 'consent' }
      : {}),
    // Stripe Connect: always use 'read_write' response_type
    ...(service === 'stripe_account' ? { response_type: 'code', scope: 'read_write' } : {}),
  })

  const redirectUrl = `${oauthUrl}?${params_url.toString()}`
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.set(`oauth_state_${service}`, state, { httpOnly: true, maxAge: 600, path: '/' })
  return response
}
