/**
 * Contact-name enrichment — Phase 0 of docs/specs/signalgent-govcon-v1.md.
 *
 * Every email used to open with a bare "Hi," because the pipeline only ever
 * knew email → domain → company, never a person. This module closes the gap
 * two ways:
 *   - `parseContactName` derives a person's name from the email localpart
 *     (bob.smith@acme.com → "Bob Smith"), tuned for PRECISION over recall: a
 *     wrong name ("Hi Meridian,") reads worse than no name, so anything
 *     ambiguous returns null. Pure function — no DB, no migration dependency.
 *   - `applyGreeting` rewrites a leading bare greeting line ("Hi,") to greet
 *     the person by first name. Applied at draft-creation time so the stored
 *     draft — what the review queue shows — is exactly what sends.
 *
 * A stored `outreach_prospects.contact_name` (manual override) always beats
 * the parse; resolution lives in `resolveContactName`, and
 * `fetchStoredContactNames` reads the overrides tolerantly (the column arrives
 * via an out-of-band migration — a query error means "no overrides yet").
 *
 * Client-safe: type-only imports.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'

/** Role/function localpart tokens that are never a person's first name. */
const ROLE_WORDS = new Set([
  'admin', 'administrator', 'accounting', 'accounts', 'ap', 'ar', 'back', 'billing', 'bd', 'bids',
  'bid', 'capture', 'careers', 'ceo', 'compliance', 'contact', 'contracts', 'contracting',
  'corporate', 'crew', 'customer', 'customerservice', 'desk', 'design', 'dev', 'director',
  'dispatch', 'estimating', 'estimates', 'email', 'enquiries', 'inquiries', 'inquiry',
  'facilities', 'field', 'finance', 'front', 'frontdesk', 'general', 'gm', 'group', 'hello',
  'help', 'helpdesk', 'hq', 'hr', 'info', 'information', 'invoices', 'it', 'jobs', 'legal',
  'mail', 'mailbox', 'main', 'manager', 'marketing', 'media', 'my', 'new', 'no', 'noreply',
  'notifications', 'office', 'operations', 'ops', 'orders', 'owner', 'payroll', 'permits',
  'personnel', 'plans', 'president', 'press', 'pricing', 'principal', 'procurement', 'project',
  'projects', 'proposal', 'proposals', 'pr', 'purchasing', 'quality', 'quote', 'quotes',
  'reception', 'recruiting', 'safety', 'sales', 'schedule', 'scheduling', 'security', 'service',
  'services', 'shop', 'staff', 'solutions', 'support', 'team', 'the', 'us', 'warranty', 'web',
  'webmaster', 'website',
])

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

/**
 * Derive "First Last" from an email's localpart, or null when uncertain.
 * Accepts only separator-delimited shapes (first.last, first_last, first-last,
 * optionally with a middle token) where the first token is a plausible name:
 * pure letters, 2+ chars, not a role word. Single-token localparts (mike@,
 * dvegroup@) are rejected outright — no way to tell a name from a company.
 */
export function parseContactName(email: string): string | null {
  const at = email.indexOf('@')
  if (at <= 0) return null
  const local = email.slice(0, at).split('+')[0].toLowerCase()
  const tokens = local.split(/[._-]/).filter(Boolean)
  if (tokens.length < 2 || tokens.length > 3) return null

  const first = tokens[0]
  if (!/^[a-z]{2,}$/.test(first) || ROLE_WORDS.has(first)) return null

  // Last token may carry trailing digits (bob.smith2@); the alpha part must
  // still look like a name-ish word and not a role word.
  const lastRaw = tokens[tokens.length - 1]
  const last = lastRaw.replace(/\d+$/, '')
  if (!/^[a-z]{2,}$/.test(last) || ROLE_WORDS.has(last)) return null
  // A middle token (first.van.dyke) must be alphabetic too.
  if (tokens.length === 3 && !/^[a-z]+$/.test(tokens[1])) return null

  // Initial-first shapes (j.smith) greet as "Hi J," — worse than "Hi,".
  if (first.length < 2) return null

  return tokens.length === 3
    ? `${cap(first)} ${cap(tokens[1])} ${cap(last)}`
    : `${cap(first)} ${cap(last)}`
}

/** First word of a stored/parsed contact name, for the greeting. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0]
  if (!first || !/^[A-Za-z][A-Za-z'’-]*$/.test(first)) return null
  return cap(first)
}

/** Stored override beats the localpart parse; blank means "no name known". */
export function resolveContactName(stored: string | null | undefined, email: string): string | null {
  return stored?.trim() || parseContactName(email)
}

/**
 * Rewrite a leading bare greeting line ("Hi," / "Hello." / "Hey") to greet by
 * first name. Only fires when the FIRST line is a greeting with no name — a
 * template that already renders "Hi Acme," is left alone — so applying it
 * twice, or with no name, is a no-op.
 */
export function applyGreeting(body: string, contactName: string | null | undefined): string {
  const first = firstNameOf(contactName)
  if (!first) return body
  return body.replace(/^(hi|hello|hey)[,.!]?[ \t]*(\r?\n)/i, (_m, greeting, nl) => `${cap(greeting)} ${first},${nl}`)
}

/**
 * Best-effort read of stored contact-name overrides for a set of prospects.
 * Returns an empty map on any error (most likely: the contact_name migration
 * hasn't been applied yet), so callers fall through to the localpart parse.
 */
export async function fetchStoredContactNames(
  supabase: SupabaseClient<Database>,
  companyId: string,
  prospectIds: string[],
): Promise<Map<string, string | null>> {
  if (prospectIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('outreach_prospects')
    .select('id, contact_name')
    .eq('company_id', companyId)
    .in('id', prospectIds)
  if (error || !data) return new Map()
  return new Map(data.map((r) => [r.id, r.contact_name]))
}
