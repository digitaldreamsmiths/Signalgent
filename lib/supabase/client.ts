'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database.types'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // During build/prerendering, env vars may not be available
    return createBrowserClient<Database>(
      'http://localhost:54321',
      'placeholder-key-for-build'
    )
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}
