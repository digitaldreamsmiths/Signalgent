import type { ContentItem, Contact, Campaign } from './types'
export type TableShape<T extends { id: string; company_id: string; created_at: string; updated_at: string }> = {
  Row: { [K in keyof T]: T[K] }; Insert: Omit<T, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string };
  Update: Partial<Omit<T, 'id' | 'company_id' | 'created_at'>>; Relationships: [];
}
export type PlatformTables = {
  platform_mail_operations: {
    Row: { id: string; company_id: string; account_id: string; status: 'sending' | 'sent' | 'uncertain'; provider_message_id: string | null; created_at: string }
    Insert: { id: string; company_id: string; account_id: string; status: 'sending' | 'sent' | 'uncertain'; provider_message_id?: string | null }
    Update: { status?: 'sending' | 'sent' | 'uncertain'; provider_message_id?: string | null }
    Relationships: []
  }
  platform_content: TableShape<ContentItem>
  platform_contacts: TableShape<Contact>
  platform_campaigns: TableShape<Campaign>
}
