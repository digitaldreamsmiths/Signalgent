import { recordClick } from '@/lib/integrations/outreach/send/track-store'

/**
 * Click-tracking redirect. Unauthenticated by necessity: the caller is the
 * recipient's browser. Records the click (best-effort) and 302s to the
 * destination in `u`.
 *
 * Not an open redirect: the destination must be on the company's own site, as
 * configured in its offer profile. Anything else, and any unknown token, lands
 * on the site root or a 404, so a click URL cannot be repurposed to bounce a
 * victim to an arbitrary host under our domain.
 */

export const dynamic = 'force-dynamic'

const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0' }

function hostAllowed(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase()
  return allowed.some((a) => h === a || h.endsWith(`.${a}`))
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const raw = new URL(request.url).searchParams.get('u') ?? ''

  let record: Awaited<ReturnType<typeof recordClick>> = null
  try {
    if (token) record = await recordClick(token)
  } catch (err) {
    console.warn('[outreach:click] record failed:', err instanceof Error ? err.message : err)
  }
  if (!record) return new Response('Not found', { status: 404, headers: NO_CACHE })

  let destination: URL | null = null
  try {
    destination = new URL(raw)
  } catch {
    destination = null
  }
  const ok = destination && /^https?:$/.test(destination.protocol) && hostAllowed(destination.hostname, record.allowedHosts)
  const target = ok ? destination!.toString() : record.allowedHosts[0] ? `https://${record.allowedHosts[0]}/` : null
  if (!target) return new Response('Not found', { status: 404, headers: NO_CACHE })
  return Response.redirect(target, 302)
}

/** Link scanners HEAD before they GET. Answer without recording or redirecting. */
export async function HEAD() {
  return new Response(null, { status: 200, headers: NO_CACHE })
}
