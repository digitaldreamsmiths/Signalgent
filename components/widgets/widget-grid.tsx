'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PlacedWidget, ModeLayout } from '@/lib/widgets/types'
import { getLayout, saveLayout, removeWidget as removeWidgetService } from '@/lib/widgets/layout-service'
import { getWidgetDef } from '@/lib/widgets/registry'
import { WidgetShell } from './widget-shell'
import { AddWidgetPanel } from './add-widget-panel'
import { WIDGET_MAP } from './widget-map'

function SortableWidget({
  widget,
  onRemove,
  isDragOverlay,
}: {
  widget: PlacedWidget
  onRemove: () => void
  isDragOverlay?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.instanceId })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: widget.size === 'full' ? 'span 2' : 'span 1',
  }

  const def = getWidgetDef(widget.type)
  const Component = WIDGET_MAP[widget.type]

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <WidgetShell
        title={def?.label ?? widget.type}
        size={widget.size}
        instanceId={widget.instanceId}
        onRemove={onRemove}
        isDragging={isDragOverlay ? false : isDragging}
        dragHandleProps={listeners}
      >
        {Component ? <Component /> : <div style={{ fontSize: 11, color: '#333' }}>Widget not found</div>}
      </WidgetShell>
    </div>
  )
}

export function WidgetGrid({ modeId }: { modeId: string }) {
  const [layout, setLayout] = useState<ModeLayout>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    setLayout(getLayout(modeId))
  }, [modeId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return
      setLayout((prev) => {
        const oldIndex = prev.findIndex((w) => w.instanceId === active.id)
        const newIndex = prev.findIndex((w) => w.instanceId === over.id)
        if (oldIndex === -1 || newIndex === -1) return prev
        const updated = arrayMove(prev, oldIndex, newIndex)
        saveLayout(modeId, updated)
        return updated
      })
    },
    [modeId]
  )

  const handleRemove = useCallback(
    (instanceId: string) => {
      const updated = removeWidgetService(modeId, instanceId)
      setLayout(updated)
    },
    [modeId]
  )

  const handleLayoutChange = useCallback(
    (newLayout: ModeLayout) => {
      if (newLayout.length === 0) {
        setLayout(getLayout(modeId))
      } else {
        setLayout(newLayout)
      }
    },
    [modeId]
  )

  const activeWidget = activeId ? layout.find((w) => w.instanceId === activeId) : null

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {/* Add widget button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          onClick={() => setPanelOpen(true)}
          style={{
            fontSize: 11,
            color: 'var(--mode-accent-text, #999)',
            background: 'var(--mode-card-bg, #161616)',
            border: '1px solid var(--mode-card-border, #222)',
            borderRadius: 6,
            padding: '5px 12px',
            cursor: 'pointer',
          }}
        >
          + Add widget
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={layout.map((w) => w.instanceId)} strategy={rectSortingStrategy}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            {layout.map((widget) => (
              <SortableWidget
                key={widget.instanceId}
                widget={widget}
                onRemove={() => handleRemove(widget.instanceId)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeWidget ? (
            <div style={{ opacity: 0.95, gridColumn: activeWidget.size === 'full' ? 'span 2' : 'span 1' }}>
              <WidgetShell
                title={getWidgetDef(activeWidget.type)?.label ?? activeWidget.type}
                size={activeWidget.size}
                instanceId={activeWidget.instanceId}
                onRemove={() => {}}
                isDragging={false}
              >
                {WIDGET_MAP[activeWidget.type] ? (() => { const C = WIDGET_MAP[activeWidget.type]; return <C /> })() : null}
              </WidgetShell>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AddWidgetPanel
        modeId={modeId}
        layout={layout}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onLayoutChange={handleLayoutChange}
      />
    </div>
  )
}
