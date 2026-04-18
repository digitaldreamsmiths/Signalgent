export type { Database, Json } from './database.types'

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

import type { Database } from './database.types'

export type Profile = Tables<'profiles'>
export type Workspace = Tables<'workspaces'>
export type WorkspaceMember = Tables<'workspace_members'>
export type Company = Tables<'companies'>
export type ConnectedAccount = Tables<'connected_accounts'>
export type IntelligenceBrief = Tables<'intelligence_briefs'>
export type ApiUsage = Tables<'api_usage'>
