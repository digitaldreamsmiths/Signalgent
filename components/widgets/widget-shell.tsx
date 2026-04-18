'use client'

import type { WidgetSize } from '@/lib/widgets/types'
import {
  WidgetLiveIndicatorProvider,
  useIsWidgetLive,
} from './widget-live-indicator'

interface WidgetShellProps {
  title: string
  size: WidgetSize
  instanceId: string
  onRemove: () => void
  children: React.ReactNode
  isDragging?: boolean
  dragHandleProps?: Record<string, unknown>
}

function SampleBadge() {
  const isLive = useIsWidgetLive()
  if (isLive) return null
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 6,
        right: 10,
        fontSize: 9,
        color: '#2a2a2a',
      }}
    >
      Sample data
    </div>
  )
}

export function WidgetShell({
  title,
  size,
  onRemove,
  children,
  isDragging,
  dragHandleProps,
}: WidgetShellProps) {
  return (
    <WidgetLiveIndicatorProvider>
      <div
        className={isDragging ? undefined : 'widget-card-glow'}
        style={{
          gridColumn: size === 'full' ? 'span 2' : 'span 1',
          background: 'var(--mode-card-bg, #161616)',
          border: '1px solid var(--mode-card-border, #222)',
          borderRadius: 10,
          padding: '13px 15px',
          opacity: isDragging ? 0.4 : 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          '--mode-accent-glow': 'color-mix(in oklch, var(--mode-accent, #8B7FF0) 30%, transparent)',
        } as React.CSSProperties}
      >
        {/* Header row */}
        <div
          className="group"
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}
        >
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            style={{ color: '#333', flexShrink: 0 }}
          >
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
              <circle cx="2" cy="2" r="1.25" />
              <circle cx="8" cy="2" r="1.25" />
              <circle cx="2" cy="8" r="1.25" />
              <circle cx="8" cy="8" r="1.25" />
              <circle cx="2" cy="14" r="1.25" />
              <circle cx="8" cy="14" r="1.25" />
            </svg>
          </div>

          {/* Title */}
          <span style={{ fontSize: 11, color: '#ffffff', flex: 1 }}>
            {title}
          </span>

          {/* Remove button */}
          <button
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#333',
              padding: 2,
              lineHeight: 1,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5" fill="none">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {children}
        </div>

        {/* Sample data badge — hidden when the child widget has signalled live */}
        <SampleBadge />
      </div>
    </WidgetLiveIndicatorProvider>
  )
}
