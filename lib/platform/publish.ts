/**
 * Publish one content item to LinkedIn. Shared by the editor's server action
 * (user-scoped client, RLS) and the scheduler (service-role client).
 *
 * Posture, same as platform_mail_operations: claim a publications row BEFORE
 * calling the provider. The partial unique index on (content_id, channel)
 * where status <> 'failed' makes the insert the lock, so an overlapping
 * attempt gets 23505 and reads the existing row instead of posting twice.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database.types'
import { loadLinkedInCredentials } from '@/lib/integrations/linkedin/tokens'
import { createTextPost, LinkedInPublishError } from '@/lib/integrations/linkedin/publish'
import { LINKEDIN_POST_SCOPE } from './connections'
import { linkedinBlocker, linkedinText } from './publish-rules'
import type { ContentItem, Publication, Result } from './types'

type DB = SupabaseClient<Database>

export async function publishToLinkedIn(db: DB, companyId: string, item: ContentItem, source: 'manual' | 'scheduled'): Promise<Result<Publication>> {
  const blocker = linkedinBlocker(item)
  if (blocker) return { ok: false, error: blocker }
  const creds = await loadLinkedInCredentials(companyId, db)
  if (!creds) return { ok: false, error: 'Connect LinkedIn in Connections before publishing.' }
  if (!creds.scopes.includes(LINKEDIN_POST_SCOPE)) return { ok: false, error: 'This LinkedIn connection is identity only. Reconnect it in Connections to allow posting.' }

  const claim = await db.from('platform_publications')
    .insert({ id: crypto.randomUUID(), company_id: companyId, content_id: item.id, channel: 'linkedin', account_id: creds.accountId, status: 'publishing', provider_post_id: null, post_url: null, error: null })
    .select('*').single()
  if (claim.error) {
    if (claim.error.code === '23505') {
      const { data: existing } = await db.from('platform_publications').select('*').eq('content_id', item.id).eq('channel', 'linkedin').neq('status', 'failed').maybeSingle()
      if (existing?.status === 'published') return { ok: true, data: existing }
      return { ok: false, error: 'This post is already being published. Check your LinkedIn feed before trying again.' }
    }
    if (/does not exist|schema cache|42P01/.test(claim.error.message)) return { ok: false, error: 'Publishing needs the 20261028 migrations applied to the database.' }
    return { ok: false, error: claim.error.message }
  }
  const row = claim.data
  try {
    const posted = await createTextPost({ accessToken: creds.accessToken, memberSub: creds.memberSub, text: linkedinText(item) })
    const done = await db.from('platform_publications')
      .update({ status: 'published', provider_post_id: posted.postUrn, post_url: posted.url, updated_at: new Date().toISOString() })
      .eq('id', row.id).select('*').single()
    // The post exists either way; a failed status write must never cause a second post.
    if (done.error) return { ok: true, data: { ...row, status: 'published', provider_post_id: posted.postUrn, post_url: posted.url } }
    console.log(`[publish] linkedin ${source} company=${companyId} content=${item.id} post=${posted.postUrn}`)
    return { ok: true, data: done.data }
  } catch (err) {
    const message = err instanceof LinkedInPublishError ? err.message : 'LinkedIn could not be reached. The post was not published.'
    // Only a provider rejection is a known non-post; a transport failure after the request left is uncertain.
    const certain = err instanceof LinkedInPublishError && err.status !== 0
    const failed = await db.from('platform_publications')
      .update({ status: 'failed', error: (certain ? message : `${message} Check your feed before publishing again.`).slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', row.id).select('*').single()
    return { ok: false, error: failed.data?.error ?? message }
  }
}

/**
 * Scheduled publishing for one tick. Picks planned LinkedIn items that opted
 * in, whose planned time has passed, and that have no publication row yet
 * (a failed attempt is retried by hand, not every five minutes). Items whose
 * planned time is more than two days gone are marked failed instead of
 * posted, so a scheduler outage never floods a feed with stale posts.
 */
export async function runScheduledPublishing(svc: DB, limit = 20): Promise<{ published: number; failed: number; stale: number; skipped: number; errors: string[] }> {
  const out = { published: 0, failed: 0, stale: 0, skipped: 0, errors: [] as string[] }
  const now = Date.now()
  const { data: due, error } = await svc.from('platform_content').select('*')
    .eq('status', 'planned').eq('auto_publish', true).contains('channels', ['linkedin'])
    .lte('planned_at', new Date(now).toISOString()).order('planned_at').limit(limit * 3)
  if (error) { out.errors.push(error.message); return out }
  if (!due?.length) return out
  const ids = due.map(d => d.id)
  const [{ data: existing }, { data: companies }] = await Promise.all([
    svc.from('platform_publications').select('content_id').in('content_id', ids).eq('channel', 'linkedin'),
    svc.from('companies').select('id, is_sample').in('id', [...new Set(due.map(d => d.company_id))]),
  ])
  const attempted = new Set((existing ?? []).map(e => e.content_id))
  const sample = new Set((companies ?? []).filter(c => c.is_sample).map(c => c.id))
  let handled = 0
  for (const raw of due) {
    if (handled >= limit) break
    if (attempted.has(raw.id) || sample.has(raw.company_id)) { out.skipped++; continue }
    const item: ContentItem = { ...raw, variants: raw.variants ?? {}, auto_publish: raw.auto_publish ?? false }
    handled++
    try {
      if (item.planned_at && now - new Date(item.planned_at).getTime() > 2 * 86400000) {
        await svc.from('platform_publications').insert({ id: crypto.randomUUID(), company_id: item.company_id, content_id: item.id, channel: 'linkedin', account_id: null, status: 'failed', provider_post_id: null, post_url: null, error: 'The planned time passed more than two days ago, so it was not posted automatically. Publish it by hand if it still applies.' })
        out.stale++
        continue
      }
      const result = await publishToLinkedIn(svc, item.company_id, item, 'scheduled')
      if (result.ok) out.published++
      else {
        out.failed++
        // Blockers that never reached the provider (no account, no scope) get a failed row too, so the editor shows why.
        const { data: has } = await svc.from('platform_publications').select('id').eq('content_id', item.id).eq('channel', 'linkedin').limit(1)
        if (!has?.length) await svc.from('platform_publications').insert({ id: crypto.randomUUID(), company_id: item.company_id, content_id: item.id, channel: 'linkedin', account_id: null, status: 'failed', provider_post_id: null, post_url: null, error: result.error.slice(0, 500) })
      }
    } catch (err) {
      out.failed++
      out.errors.push(`${item.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return out
}
