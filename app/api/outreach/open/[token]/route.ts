import { recordOpen } from '@/lib/integrations/outreach/send/track-store'

/**
 * Open-tracking pixel. Unauthenticated by necessity: the caller is the
 * recipient's mail client, not a user of this app.
 *
 * Always returns the same 1x1 GIF, whether or not the token matched, so the
 * endpoint leaks nothing about which tokens are real. Recording is best-effort
 * and never affects the response.
 */

// A transparent 1x1 GIF. Smaller than the equivalent PNG and rendered by every
// mail client that loads images at all.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

// Never prerender or cache: a cached pixel is an unrecorded open.
export const dynamic = 'force-dynamic'

function pixelResponse(): Response {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      // Gmail proxies and caches images; these headers are the only lever we
      // have to ask for a re-fetch on each view. Repeat opens under-count
      // regardless, which is why open_count is treated as soft data.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (token) await recordOpen(token)
  } catch (err) {
    // A tracking failure must never turn into a broken image in a real email.
    console.warn('[outreach:open] record failed:', err instanceof Error ? err.message : err)
  }
  return pixelResponse()
}

/** Some clients HEAD the image before fetching it. Answer without recording. */
export async function HEAD() {
  return pixelResponse()
}
