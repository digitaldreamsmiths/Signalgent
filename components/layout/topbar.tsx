'use client'

import { useRouter } from 'next/navigation'
import { LogOut, User, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CompanySwitcher } from '@/components/layout/company-switcher'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function Topbar() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header
      className="flex shrink-0 items-center justify-between px-5"
      style={{ height: 44, background: 'hsl(var(--background))', position: 'relative' }}
    >
      {/* Left: Wordmark + Company Switcher */}
      <div className="flex items-center gap-4">
        <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.02em', color: '#999' }}>
          Signalgent
        </span>
        <CompanySwitcher />
      </div>

      {/* Right: Avatar */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center justify-center rounded-full p-0.5 hover:opacity-80 transition-opacity">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[10px]" style={{ background: '#222', color: '#888' }}>
              U
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => router.push('/settings/connections')}>
            <Settings className="h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
