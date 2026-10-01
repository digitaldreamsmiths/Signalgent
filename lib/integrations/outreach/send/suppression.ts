import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

type DB = SupabaseClient<Database>
type SuppressedDisposition = 'bounced' | 'unsubscribed'

const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** Close every record for this address and remove its pending mail. */
export async function suppressRecipient(
  supabase: DB,
  companyId: string,
  email: string,
  disposition: SuppressedDisposition,
  at: string,
): Promise<void> {
  const address = normalizeEmail(email)
  if (!address) throw new Error('Cannot suppress an empty email address')

  const { data: matches, error: lookupError } = await supabase
    .from('outreach_prospects')
    .select('id, email, disposition, disposition_at')
    .eq('company_id', companyId)
    .ilike('email', address)
  if (lookupError) throw lookupError
  const exact = (matches ?? []).filter((p) => normalizeEmail(p.email) === address)
  if (exact.length === 0) throw new Error('Recipient was not found')

  const ids = exact.map((p) => p.id)
  // An explicit opt-out always wins over a delivery failure.
  const outcome = disposition === 'unsubscribed' || exact.some((p) => p.disposition === 'unsubscribed')
    ? 'unsubscribed'
    : 'bounced'
  const firstAt = [at, ...exact.filter((p) => p.disposition === outcome && p.disposition_at).map((p) => p.disposition_at!)]
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0]
  const { error: updateError } = await supabase
    .from('outreach_prospects')
    .update({ disposition: outcome, disposition_at: firstAt })
    .eq('company_id', companyId)
    .in('id', ids)
  if (updateError) throw updateError

  const { error: cancelError } = await supabase
    .from('outreach_sends')
    .update({ status: 'canceled', error: `recipient ${outcome}` })
    .eq('company_id', companyId)
    .eq('status', 'queued')
    .in('prospect_id', ids)
  if (cancelError) throw cancelError
}

/** Check the address as well as the prospect ID before releasing a queued send. */
export async function recipientIsSuppressed(supabase: DB, companyId: string, email: string): Promise<boolean> {
  const address = normalizeEmail(email)
  if (!address) return true
  const { data, error } = await supabase
    .from('outreach_prospects')
    .select('email, disposition')
    .eq('company_id', companyId)
    .ilike('email', address)
  if (error) throw error
  return (data ?? []).some((p) =>
    normalizeEmail(p.email) === address && (p.disposition === 'bounced' || p.disposition === 'unsubscribed'),
  )
}
