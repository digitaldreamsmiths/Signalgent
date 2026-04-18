/**
 * GET /api/integrations/stripe/callback
 *
 * Stripe redirects the browser here after OAuth. Validates state signature
 * and expiry, re-checks that the authenticated user still owns the company,
 * exchanges the code, saves encrypted tokens, redirects to /finance.
 *
 * Idempotent on (company_id, service): a replayed callback with the same
 * state will upsert the same row.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { verifyState, InvalidStateError } from '@/lib/integrations/oauth-state'
import { exchangeCode, retrieveAccount } from '@/lib/integrations/stripe/fetch'
import { saveStripeCredentials, STRIPE_SERVICE } from '@/lib/integrations/stripe/tokens'
import { invalidateFinanceSnapshot } from '@/lib/integrations/stripe/snapshot'

function redirectToFinance(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL('/finance', origin)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const stripeError = searchParams.get('error')
  const stripeErrorDesc = searchParams.get('error_description')

  // User cancelled or Stripe returned an error
  if (stripeError) {
    return redirectToFinance(origin, {
      integration: 'stripe',
      status: 'cancelled',
      reason: stripeErrorDesc ?? stripeError,
    })
  }

  if (!code || !stateParam) {
    return redirectToFinance(origin, {
      integration: 'stripe',
      status: 'error',
      reason: 'Missing code or state',
    })
  }

  // 1. Verify state signature + expiry
  let payload
  try {
    payload = verifyState(stateParam)
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return redirectToFinance(origin, {
        integration: 'stripe',
        status: 'error',
        reason: err.message,
      })
    }
    throw err
  }

  if (payload.service !== STRIPE_SERVICE) {
    return redirectToFinance(origin, {
      integration: 'stripe',
      status: 'error',
      reason: 'State service mismatch',
    })
  }

  // 2. Re-verify the authenticated user still owns this company and matches
  //    the user embedded in the state (defence in depth against session
  //    swaps mid-flow).
  let access
  try {
    access = await requireCompanyAccess(payload.companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return redirectToFinance(origin, {
        integration: 'stripe',
        status: 'error',
        reason: err.message,
      })
    }
    throw err
  }
  if (access.userId !== payload.userId) {
    return redirectToFinance(origin, {
      integration: 'stripe',
      status: 'error',
      reason: 'User mismatch on callback',
    })
  }

  // 3. Exchange code for tokens
  let tokens
  try {
    tokens = await exchangeCode(code)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token exchange failed'
    return redirectToFinance(origin, {
      integration: 'stripe',
      status: 'error',
      reason: msg,
    })
  }

  // 4. Pull a label for nicer UI
  let label: string | null = null
  try {
    const account = await retrieveAccount(tokens.access_token)
    label = account.business_profile?.name ?? account.email ?? tokens.stripe_user_id
  } catch {
    label = tokens.stripe_user_id
  }

  // 5. Save encrypted + invalidate cache
  await saveStripeCredentials(access.companyId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    stripeUserId: tokens.stripe_user_id,
    scope: tokens.scope ?? null,
    accountLabel: label,
  })
  await invalidateFinanceSnapshot(access.companyId)

  return redirectToFinance(origin, {
    integration: 'stripe',
    status: 'connected',
  })
}
