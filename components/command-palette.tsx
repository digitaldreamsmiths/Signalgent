'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight } from 'lucide-react'
import { MODES, type ModeId } from '@/contexts/mode-context'
import { cn } from '@/lib/utils'

interface CommandItem {
  id: string
  label: string
  description?: string
  action: () => void
  group: string
  accent?: string
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const navigate = useCallback(
    (href: string) => {
      router.push(href)
      onClose()
    },
    [router, onClose]
  )

  const items: CommandItem[] = [
    ...Object.entries(MODES).map(([id, m]) => ({
      id: `nav-${id}`,
      label: m.label,
      description: `Go to ${m.label}`,
      action: () => navigate(m.href),
      group: 'Navigate',
      accent: m.accent,
    })),
    {
      id: 'action-compose',
      label: 'Compose email',
      description: 'Draft a new message',
      action: () => navigate('/communications'),
      group: 'Quick Actions',
      accent: MODES.communications.accent,
    },
    {
      id: 'action-campaign',
      label: 'New campaign',
      description: 'Create a marketing campaign',
      action: () => navigate('/marketing'),
      group: 'Quick Actions',
      accent: MODES.marketing.accent,
    },
    {
      id: 'action-revenue',
      label: 'View revenue',
      description: 'Financial summary',
      action: () => navigate('/finance'),
      group: 'Quick Actions',
      accent: MODES.finance.accent,
    },
  ]

  const filtered = query
    ? items.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.description?.toLowerCase().includes(query.toLowerCase())
      )
    : items

  const groups = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {})

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault()
        filtered[selectedIndex].action()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [filtered, selectedIndex, onClose]
  )

  if (!open) return null

  let flatIndex = -1

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg overflow-hidden"
        style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12 }}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #222' }}>
          <Search className="h-4 w-4 shrink-0" style={{ color: '#555' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: '#ccc' }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd style={{ fontSize: 10, color: '#444', background: '#222', borderRadius: 4, padding: '2px 6px', border: '1px solid #333' }}>ESC</kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2">
          {Object.entries(groups).map(([group, groupItems]) => (
            <div key={group} className="mb-2 last:mb-0">
              <div style={{ fontSize: 10, fontWeight: 500, color: '#444', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {group}
              </div>
              {groupItems.map((item) => {
                flatIndex++
                const idx = flatIndex
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className="flex w-full items-center gap-3 text-left text-sm"
                    style={{
                      padding: '8px',
                      borderRadius: 8,
                      background: idx === selectedIndex ? 'rgba(255,255,255,0.05)' : 'transparent',
                      color: idx === selectedIndex ? '#ddd' : '#777',
                      transition: 'background 100ms',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: item.accent || '#555',
                        flexShrink: 0,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontWeight: 500 }}>{item.label}</div>
                      {item.description && (
                        <div style={{ fontSize: 11, color: '#555' }}>{item.description}</div>
                      )}
                    </div>
                    {idx === selectedIndex && <ArrowRight className="h-3 w-3 shrink-0" style={{ color: '#555' }} />}
                  </button>
                )
              })}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm" style={{ color: '#444' }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
