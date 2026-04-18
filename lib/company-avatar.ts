const COLORS = [
  { bg: '#1e3a5f', text: '#85B7EB' },
  { bg: '#1a3a2a', text: '#5DCAA5' },
  { bg: '#3a1a0a', text: '#F0997B' },
  { bg: '#2e1a3a', text: '#C4B5FD' },
  { bg: '#3a2a00', text: '#EF9F27' },
  { bg: '#1a1a3a', text: '#93C5FD' },
  { bg: '#1a2e1a', text: '#86EFAC' },
  { bg: '#3a1a2a', text: '#F9A8D4' },
]

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function getAvatarColor(name: string): { bg: string; text: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash += name.charCodeAt(i)
  }
  return COLORS[hash % COLORS.length]
}
