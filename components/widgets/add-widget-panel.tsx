'use client'

import { useState } from 'react'
import type { WidgetDefinition, ModeLayout } from '@/lib/widgets/types'
import { getWidgetsForMode } from '@/lib/widgets/registry'
import { addWidget, resetLayout } from '@/lib/widgets/layout-service'

interface AddWidgetPanelProps {
  modeId: string
  layout: ModeLayout
  open: boolean
  onClose: () => void
  onLayoutChange: (layout: ModeLayout) => void
}

export function AddWidgetPanel({ modeId, layout, open, onClose, onLayoutChange }: AddWidgetPanelProps) {
  const [resetMsg, setResetMsg] = useState(false)
  const allWidgets = getWidgetsForMode(modeId)
  const placedTypes = new Set(layout.map((w) => w.type))
  const available = allWidgets.filter((w) => !placedTypes.has(w.type))

  function handleAdd(widget: WidgetDefinition) {
    const updated = addWidget(modeId, widget.type)
    onLayoutChange(updated)
    onClose()
  }

  function handleReset() {
    resetLayout(modeId)
    setResetMsg(true)
    setTimeout(() => {
      setResetMsg(false)
      onClose()
      // Force re-read from defaults
      onLayoutChange([])
    }, 600)
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
        background: '#111',
        borderLeft: '1px solid #222',
        zIndex: 50,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 300ms ease',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #1a1a1a' }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#ccc' }}>Add widget</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 4 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.5" fill="none">
            <line x1="2" y1="2" x2="12" y2="12" />
            <line x1="12" y1="2" x2="2" y2="12" />
          </svg>
        </button>
      </div>

      {/* Widget list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {available.length === 0 ? (
          <div style={{ fontSize: 12, color: '#999999', textAlign: 'center', padding: '30px 0' }}>
            All widgets are already on your dashboard.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {available.map((w) => (
              <div
                key={w.id}
                style={{
                  background: '#161616',
                  border: '1px solid #222',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#ffffff' }}>{w.label}</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: '#555',
                      background: '#1a1a1a',
                      borderRadius: 4,
                      padding: '2px 6px',
                    }}
                  >
                    {w.size}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#999999', marginBottom: 8 }}>{w.description}</div>
                <button
                  onClick={() => handleAdd(w)}
                  style={{
                    fontSize: 11,
                    color: 'var(--mode-accent-text, #ccc)',
                    background: 'var(--mode-card-bg, #1a1a1a)',
                    border: '1px solid var(--mode-card-border, #333)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1a1a1a' }}>
        {resetMsg ? (
          <span style={{ fontSize: 11, color: 'var(--mode-accent, #888)' }}>Layout reset</span>
        ) : (
          <button
            onClick={handleReset}
            style={{
              fontSize: 11,
              color: '#444',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Reset to default
          </button>
        )}
      </div>
    </div>
  )
}
