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
          service: 'gmail' | 'outlook' | 'linkedin_page' | 'linkedin' | 'facebook_page' | 'shopify' | 'stripe_account' | 'quickbooks' | 'plaid' | 'google_analytics' | 'etsy' | 'pinterest'
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
          service: 'gmail' | 'outlook' | 'linkedin_page' | 'linkedin' | 'facebook_page' | 'shopify' | 'stripe_account' | 'quickbooks' | 'plaid' | 'google_analytics' | 'etsy' | 'pinterest'
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
      outreach_prospects: {
        Row: {
          id: string
          company_id: string
          email: string
          domain: string | null
          status: 'new' | 'enriched' | 'skipped' | 'drafted' | 'error'
          skip_stage: 'enrich' | 'synthesis' | 'draft' | null
          skip_reason: string | null
          recipient_name: string | null
          recipient_id: string | null
          uei: string | null
          resolution_confidence: number | null
          resolution_method: 'heuristic' | 'ai_judge' | null
          business_types: string[] | null
          location: string | null
          footprint: Json | null
          disposition: 'open' | 'replied' | 'interested' | 'not_interested' | 'bounced' | 'unsubscribed'
          disposition_at: string | null
          enriched_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          email: string
          domain?: string | null
          status?: 'new' | 'enriched' | 'skipped' | 'drafted' | 'error'
          skip_stage?: 'enrich' | 'synthesis' | 'draft' | null
          skip_reason?: string | null
          recipient_name?: string | null
          recipient_id?: string | null
          uei?: string | null
          resolution_confidence?: number | null
          resolution_method?: 'heuristic' | 'ai_judge' | null
          business_types?: string[] | null
          location?: string | null
          footprint?: Json | null
          disposition?: 'open' | 'replied' | 'interested' | 'not_interested' | 'bounced' | 'unsubscribed'
          disposition_at?: string | null
          enriched_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          domain?: string | null
          status?: 'new' | 'enriched' | 'skipped' | 'drafted' | 'error'
          skip_stage?: 'enrich' | 'synthesis' | 'draft' | null
          skip_reason?: string | null
          recipient_name?: string | null
          recipient_id?: string | null
          uei?: string | null
          resolution_confidence?: number | null
          resolution_method?: 'heuristic' | 'ai_judge' | null
          business_types?: string[] | null
          location?: string | null
          footprint?: Json | null
          disposition?: 'open' | 'replied' | 'interested' | 'not_interested' | 'bounced' | 'unsubscribed'
          disposition_at?: string | null
          enriched_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outreach_drafts: {
        Row: {
          id: string
          prospect_id: string
          company_id: string
          subject: string
          body: string
          angle: string | null
          synthesis_confidence: number | null
          facts_for_draft: Json
          facts_used: Json
          drifted_facts: Json
          clean: boolean
          status: 'pending' | 'approved' | 'edited' | 'rejected' | 'exported'
          step: number
          reviewer_notes: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          prospect_id: string
          company_id: string
          subject: string
          body: string
          angle?: string | null
          synthesis_confidence?: number | null
          facts_for_draft?: Json
          facts_used?: Json
          drifted_facts?: Json
          clean?: boolean
          status?: 'pending' | 'approved' | 'edited' | 'rejected' | 'exported'
          step?: number
          reviewer_notes?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          subject?: string
          body?: string
          angle?: string | null
          synthesis_confidence?: number | null
          facts_for_draft?: Json
          facts_used?: Json
          drifted_facts?: Json
          clean?: boolean
          status?: 'pending' | 'approved' | 'edited' | 'rejected' | 'exported'
          step?: number
          reviewer_notes?: string | null
          reviewed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outreach_settings: {
        Row: {
          company_id: string
          sender_name: string | null
          sender_email: string | null
          reply_to: string | null
          daily_send_limit: number
          send_window_start: string
          send_window_end: string
          timezone: string
          min_gap_minutes: number
          signature: string | null
          physical_address: string | null
          unsubscribe_line: string | null
          provider: 'dry_run' | 'gmail' | 'resend'
          active: boolean
          last_reply_scan_at: string | null
          warmup_enabled: boolean
          warmup_start_per_day: number
          warmup_increment_per_day: number
          warmup_started_at: string | null
          bounce_pause_enabled: boolean
          bounce_pause_threshold: number
          bounce_pause_window_days: number
          bounce_pause_min_sends: number
          pause_reason: 'manual' | 'bounce_rate' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          company_id: string
          sender_name?: string | null
          sender_email?: string | null
          reply_to?: string | null
          daily_send_limit?: number
          send_window_start?: string
          send_window_end?: string
          timezone?: string
          min_gap_minutes?: number
          signature?: string | null
          physical_address?: string | null
          unsubscribe_line?: string | null
          provider?: 'dry_run' | 'gmail' | 'resend'
          active?: boolean
          last_reply_scan_at?: string | null
          warmup_enabled?: boolean
          warmup_start_per_day?: number
          warmup_increment_per_day?: number
          warmup_started_at?: string | null
          bounce_pause_enabled?: boolean
          bounce_pause_threshold?: number
          bounce_pause_window_days?: number
          bounce_pause_min_sends?: number
          pause_reason?: 'manual' | 'bounce_rate' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          sender_name?: string | null
          sender_email?: string | null
          reply_to?: string | null
          daily_send_limit?: number
          send_window_start?: string
          send_window_end?: string
          timezone?: string
          min_gap_minutes?: number
          signature?: string | null
          physical_address?: string | null
          unsubscribe_line?: string | null
          provider?: 'dry_run' | 'gmail' | 'resend'
          active?: boolean
          last_reply_scan_at?: string | null
          warmup_enabled?: boolean
          warmup_start_per_day?: number
          warmup_increment_per_day?: number
          warmup_started_at?: string | null
          bounce_pause_enabled?: boolean
          bounce_pause_threshold?: number
          bounce_pause_window_days?: number
          bounce_pause_min_sends?: number
          pause_reason?: 'manual' | 'bounce_rate' | null
          updated_at?: string
        }
        Relationships: []
      }
      outreach_sends: {
        Row: {
          id: string
          company_id: string
          prospect_id: string
          draft_id: string
          provider: string
          recipient_email: string
          subject: string
          body: string
          status: 'queued' | 'sending' | 'sent' | 'failed' | 'canceled'
          scheduled_at: string | null
          sent_at: string | null
          replied_at: string | null
          bounced_at: string | null
          provider_message_id: string | null
          thread_id: string | null
          message_id_header: string | null
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          prospect_id: string
          draft_id: string
          provider: string
          recipient_email: string
          subject: string
          body: string
          status?: 'queued' | 'sending' | 'sent' | 'failed' | 'canceled'
          scheduled_at?: string | null
          sent_at?: string | null
          replied_at?: string | null
          bounced_at?: string | null
          provider_message_id?: string | null
          thread_id?: string | null
          message_id_header?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: 'queued' | 'sending' | 'sent' | 'failed' | 'canceled'
          scheduled_at?: string | null
          sent_at?: string | null
          replied_at?: string | null
          bounced_at?: string | null
          provider_message_id?: string | null
          thread_id?: string | null
          message_id_header?: string | null
          error?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
