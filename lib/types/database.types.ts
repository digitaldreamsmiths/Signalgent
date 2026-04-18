export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          first_name: string | null
          last_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          first_name?: string | null
          last_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          first_name?: string | null
          last_name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
        }
        Update: {
          name?: string
          slug?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string
        }
        Update: {
          role?: 'owner' | 'admin' | 'member'
        }
        Relationships: []
      }
      companies: {
        Row: {
          id: string
          workspace_id: string
          name: string
          slug: string
          industry: string | null
          logo_url: string | null
          website: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          slug: string
          industry?: string | null
          logo_url?: string | null
          website?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          slug?: string
          industry?: string | null
          logo_url?: string | null
          website?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      connected_accounts: {
        Row: {
          id: string
          company_id: string
          service: 'gmail' | 'outlook' | 'linkedin_page' | 'facebook_page' | 'shopify' | 'stripe_account' | 'quickbooks' | 'plaid' | 'google_analytics'
          access_token: string | null
          refresh_token: string | null
          token_expires_at: string | null
          scope: string | null
          account_identifier: string | null
          metadata: Json
          status: 'connected' | 'expired' | 'revoked' | 'error' | 'disconnected'
          provider_account_id: string | null
          account_label: string | null
          scopes: string[] | null
          last_synced_at: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          service: 'gmail' | 'outlook' | 'linkedin_page' | 'facebook_page' | 'shopify' | 'stripe_account' | 'quickbooks' | 'plaid' | 'google_analytics'
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          scope?: string | null
          account_identifier?: string | null
          metadata?: Json
          status?: 'connected' | 'expired' | 'revoked' | 'error' | 'disconnected'
          provider_account_id?: string | null
          account_label?: string | null
          scopes?: string[] | null
          last_synced_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          scope?: string | null
          account_identifier?: string | null
          metadata?: Json
          status?: 'connected' | 'expired' | 'revoked' | 'error' | 'disconnected'
          provider_account_id?: string | null
          account_label?: string | null
          scopes?: string[] | null
          last_synced_at?: string | null
          last_error?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_briefs: {
        Row: {
          id: string
          company_id: string
          brief_date: string
          summary: string | null
          email_insights: Json
          marketing_insights: Json
          finance_insights: Json
          commerce_insights: Json
          priority_actions: Json
          generated_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          brief_date: string
          summary?: string | null
          email_insights?: Json
          marketing_insights?: Json
          finance_insights?: Json
          commerce_insights?: Json
          priority_actions?: Json
          generated_at?: string | null
          created_at?: string
        }
        Update: {
          summary?: string | null
          email_insights?: Json
          marketing_insights?: Json
          finance_insights?: Json
          commerce_insights?: Json
          priority_actions?: Json
          generated_at?: string | null
        }
        Relationships: []
      }
      api_usage: {
        Row: {
          id: string
          company_id: string
          user_id: string | null
          service: 'anthropic' | 'fal'
          model: string | null
          input_tokens: number | null
          output_tokens: number | null
          cost_usd: number | null
          feature: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id?: string | null
          service: 'anthropic' | 'fal'
          model?: string | null
          input_tokens?: number | null
          output_tokens?: number | null
          cost_usd?: number | null
          feature?: string | null
          created_at?: string
        }
        Update: {
          model?: string | null
          input_tokens?: number | null
          output_tokens?: number | null
          cost_usd?: number | null
          feature?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
