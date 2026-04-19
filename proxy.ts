import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request)
  } catch (err) {
    // If Supabase is unreachable or anything else in updateSession throws,
    // fall through rather than crash the whole deployment. Auth-protected
    // pages will still enforce access via their own server-side checks
    // (e.g. /api/onboarding validates the session before any DB writes).
    console.error('[proxy] updateSession failed, falling through:', err)
    return NextResponse.next({ request })
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
