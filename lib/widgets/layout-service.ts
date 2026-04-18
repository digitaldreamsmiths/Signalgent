import type { ModeLayout, PlacedWidget } from './types'
import { DEFAULT_LAYOUTS, getWidgetDef } from './registry'

function storageKey(modeId: string): string {
  return `signalgent_layout_${modeId}`
}

function buildDefaultLayout(modeId: string): ModeLayout {
  const types = DEFAULT_LAYOUTS[modeId] || []
  return types.map((type) => {
    const def = getWidgetDef(type)
    return {
      instanceId: crypto.randomUUID(),
      type,
      size: def?.size ?? 'full',
    }
  })
}

export function getLayout(modeId: string): ModeLayout {
  if (typeof window === 'undefined') return buildDefaultLayout(modeId)
  const raw = localStorage.getItem(storageKey(modeId))
  if (!raw) return buildDefaultLayout(modeId)
  try {
    const parsed = JSON.parse(raw) as ModeLayout
    if (!Array.isArray(parsed) || parsed.length === 0) return buildDefaultLayout(modeId)
    return parsed
  } catch {
    return buildDefaultLayout(modeId)
  }
}

export function saveLayout(modeId: string, layout: ModeLayout): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(storageKey(modeId), JSON.stringify(layout))
}

export function resetLayout(modeId: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(storageKey(modeId))
}

export function addWidget(modeId: string, widgetType: string): ModeLayout {
  const layout = getLayout(modeId)
  const def = getWidgetDef(widgetType)
  const newWidget: PlacedWidget = {
    instanceId: crypto.randomUUID(),
    type: widgetType,
    size: def?.size ?? 'full',
  }
  const updated = [...layout, newWidget]
  saveLayout(modeId, updated)
  return updated
}

export function removeWidget(modeId: string, instanceId: string): ModeLayout {
  const layout = getLayout(modeId)
  const updated = layout.filter((w) => w.instanceId !== instanceId)
  saveLayout(modeId, updated)
  return updated
}
