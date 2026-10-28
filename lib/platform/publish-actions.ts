'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCompanyAccess } from '@/lib/integrations/auth'
import { publishToLinkedIn } from './publish'
import { validUuid } from './validation'
import type { Channel, Publication, Result } from './types'

/** Publish the SAVED version of a content item to one channel, right now. */
export async function publishContent(companyId: string, contentId: string, channel: Channel): Promise<Result<Publication>> {
  try {
    if (!validUuid(companyId)) throw new Error('Choose a business first.')
    if (!validUuid(contentId)) throw new Error('Save the post before publishing it.')
    if (channel !== 'linkedin') throw new Error('Publishing is available for LinkedIn only right now.')
    await requireCompanyAccess(companyId)
    const db = await createClient()
    const [{ data: company }, { data: item, error }] = await Promise.all([
      db.from('companies').select('is_sample').eq('id', companyId).single(),
      db.from('platform_content').select('*').eq('id', contentId).eq('company_id', companyId).maybeSingle(),
    ])
    if (!company || company.is_sample) throw new Error('Sample businesses cannot publish.')
    if (error) throw new Error(error.message)
    if (!item) throw new Error('That post no longer exists.')
    return await publishToLinkedIn(db, companyId, { ...item, variants: item.variants ?? {}, auto_publish: item.auto_publish ?? false }, 'manual')
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.message ? err.message : 'The post could not be published. Try again.' }
  }
}
