import { recordUnsubscribe } from '@/lib/integrations/outreach/send/track-store'

/**
 * Unsubscribe endpoint. Unauthenticated by necessity — the caller is the
 * recipient, who has no account here.
 *
 * GET does NOT unsubscribe. It renders a confirmation page with a POST button.
 * This matters: corporate security gateways and Outlook's link scanner crawl
 * every URL in an inbound email, so a mutating GET would silently suppress
 * prospects who never touched the link.
 *
 * POST is the mutation, and doubles as the RFC 8058 one-click target advertised
 * by the List-Unsubscribe-Post header. One-click clients POST directly with no
 * confirmation step, which is exactly what the spec intends.
 */

export const dynamic = 'force-dynamic'

function page(title: string, message: string, form?: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; padding:24px; }
  main { max-width:26rem; text-align:center; }
  h1 { font-size:1.15rem; margin:0 0 .6rem; }
  p { margin:0 0 1.25rem; opacity:.75; }
  button { font:inherit; font-weight:600; padding:.6rem 1.2rem; border-radius:8px;
           border:0; background:#D85A30; color:#fff; cursor:pointer; }
</style></head>
<body><main><h1>${title}</h1><p>${message}</p>${form ?? ''}</main></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // No lookup here on purpose: confirming whether a token exists before the
  // user acts would let a crawler enumerate live sends.
  return page(
    'Unsubscribe',
    'Confirm and you will not receive any further emails from us.',
    `<form method="post" action="/api/outreach/unsubscribe/${encodeURIComponent(token)}"><button type="submit">Unsubscribe me</button></form>`,
  )
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let result: Awaited<ReturnType<typeof recordUnsubscribe>> = 'unknown'
  try {
    if (token) result = await recordUnsubscribe(token)
  } catch (err) {
    console.warn('[outreach:unsubscribe] failed:', err instanceof Error ? err.message : err)
  }

  // One-click clients (RFC 8058) send List-Unsubscribe=One-Click and want a
  // bare 200, not HTML. They must never see an error page: a non-2xx here can
  // get the sender flagged for an unhonored unsubscribe.
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = await request.text().catch(() => '')
    if (body.includes('List-Unsubscribe=One-Click')) {
      return new Response(null, { status: 200 })
    }
  }

  return result === 'done'
    ? page('You are unsubscribed', 'You will not receive further emails from us. Sorry for the interruption.')
    : page('Link not recognized', 'This unsubscribe link is no longer valid. Reply to the email and we will remove you by hand.')
}
