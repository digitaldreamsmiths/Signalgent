export type WidgetSize = 'half' | 'full'

export interface WidgetDefinition {
  id: string
  type: string
  label: string
  description: string
  size: WidgetSize
  mode: string
  resizable?: boolean
  /** Service(s) this widget requires to show live data */
  requiredServices?: string[]
}

export interface PlacedWidget {
  instanceId: string
  type: string
  size: WidgetSize
}

export type ModeLayout = PlacedWidget[]
