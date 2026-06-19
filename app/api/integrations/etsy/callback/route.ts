/**
 * GET /api/integrations/etsy/callback
 *
 * Etsy redirects the browser here after OAuth. Validates state
 * signature and expiry, re-checks that the authenticated user still
 * owns the company, reads the PKCE verifier from the cookie written at
 * connect time, exchanges the code, resolves the shop owned by the
 * authenticated Etsy user, saves encrypted tokens, and redirects to
 * /commerce.
 *
 * Idempotent on (company_id, 'etsy'): a replayed callback with the
 * same state will upsert the same row, but the PKCE cookie is cleared
 * unconditionally below, so a replay without a fresh verifier will
 * fail at exchange-time rather than succeed twice.
 *
 * Policy decisions:
 *   - Etsy enforces one shop per user, so there is no multi-shop
 *     picker needed. If the user hasn't set up a shop yet, we redirect
 *     with `status=error&reason=...` rather than silently saving an
 *     empty connection.
 *   - We save `currency_code` on the row's metadata so the snapshot
 *     doesn't need to re-hit the shop endpoint on every refresh.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { verifyState, InvalidStateError } from '@/lib/integrations/oauth-state'
import {
  exchangeCode,
  extractUserIdFromToken,
  getUserShop,
} from '@/lib/integrations/etsy/fetch'
import {
  saveEtsyCredentials,
  ETSY_SERVICE,
} from '@/lib/integrations/etsy/tokens'
import { invalidateCommerceSnapshot } from '@/lib/integrations/etsy/snapshot'
import {
  clearPkceCookie,
  readPkceCookie,
  stateCookieKey,
} from '@/lib/integrations/etsy/pkce-cookie'

function redirectToCommerce(
  origin: string,
  params: Record<string, string>,
  cookieKeyToClear?: string
): NextResponse {
  const url = new URL('/settings/connections', origin)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const response = NextResponse.redirect(url)
  if (cookieKeyToClear) {
    clearPkceCookie(response, cookieKeyToClear)
  }
  return response
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const etsyError = searchParams.get('error')
  const etsyErrorDesc = searchParams.get('error_description')

  const cookieKey = stateParam ? stateCookieKey(stateParam) : undefined

  if (etsyError) {
    return redirectToCommerce(
      origin,
      {
        integration: 'etsy',
        status: 'cancelled',
        reason: etsyErrorDesc ?? etsyError,
      },
      cookieKey
    )
  }

  if (!code || !stateParam) {
    return redirectToCommerce(
      origin,
      {
        integration: 'etsy',
        status: 'error',
        reason: 'Missing code or state',
      },
      cookieKey
    )
  }

  // 1. Verify state signature + expiry
  let payload
  try {
    payload = verifyState(stateParam)
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return redirectToCommerce(
        origin,
        {
          integration: 'etsy',
          status: 'error',
          reason: err.message,
        },
        cookieKey
      )
    }
    throw err
  }

  if (payload.service !== ETSY_SERVICE) {
    return redirectToCommerce(
      origin,
      {
        integration: 'etsy',
        status: 'error',
        reason: 'State service mismatch',
      },
      cookieKey
    )
  }

  // 2. Re-verify the authenticated user still owns this company and
  //    matches the user embedded in the state.
  let access
  try {
    access = await requireCompanyAccess(payload.companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return redirectToCommerce(
        origin,
        {
          integration: 'etsy',
          status: 'error',
          reason: err.message,
        },
        cookieKey
      )
    }
    throw err
  }
  if (access.userId !== payload.userId) {
    return redirectToCommerce(
      origin,
      {
        integration: 'etsy',
        status: 'error',
        reason: 'User mismatch on callback',
      },
      cookieKey
    )
  }

  // 3. Recover the PKCE verifier from the cookie we wrote at connect.
  const codeVerifier = cookieKey ? readPkceCookie(request, cookieKey) : null
  if (!codeVerifier) {
    return redirectToCommerce(
      origin,
      {
        integration: 'etsy',
        status: 'error',
        reason: 'PKCE verifier missing — start the connect flow from /commerce',
      },
      cookieKey
    )
  }

  // 4. Exchange code for tokens. Redirect URI must exactly match
  //    what was sent to Etsy on the authorize step.
  const redirectUri = new URL(
    '/api/integrations/etsy/callback',
    origin
  ).toString()
  let tokens
  try {
    tokens = await exchangeCode({ code, redirectUri, codeVerifier })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token exchange failed'
    return redirectToCommerce(
      origin,
      {
        integration: 'etsy',
        status: 'error',
        reason: msg,
      },
      cookieKey
    )
  }

  // 5. Resolve the shop the authenticated user owns.
  let shopId: string
  let shopName: string
  let currencyCode: string
  try {
    const etsyUserId = extractUserIdFromToken(tokens.access_token)
    const shop = await getUserShop({
      accessToken: tokens.access_token,
      userId: etsyUserId,
    })
    if (!shop) {
      return redirectToCommerce(
        origin,
        {
          integration: 'etsy',
          status: 'error',
          reason: 'No Etsy shop found on this account — open an Etsy shop, then retry',
        },
        cookieKey
      )
    }
    shopId = String(shop.shop_id)
    shopName = shop.shop_name
    currencyCode = shop.currency_code
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Shop lookup failed'
    return redirectToCommerce(
      origin,
      {
        integration: 'etsy',
        status: 'error',
        reason: msg,
      },
      cookieKey
    )
  }

  // 6. Save encrypted + invalidate cache
  await saveEtsyCredentials(access.companyId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    shopId,
    shopName,
    currencyCode,
    scope: null, // Etsy does not return scope on token response
  })
  await invalidateCommerceSnapshot(access.companyId)

  return redirectToCommerce(
    origin,
    {
      integration: 'etsy',
      status: 'connected',
    },
    cookieKey
  )
}
