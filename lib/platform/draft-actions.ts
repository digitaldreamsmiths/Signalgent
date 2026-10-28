'use server'

import { createClient } from '@/lib/supabase/server'
import { requireCompanyAccess } from '@/lib/integrations/auth'
import { loadOfferProfile } from '@/lib/integrations/outreach/offer-profile'
import { callClaudeJSON } from '@/lib/integrations/outreach/llm'
import { systemPrompt, userPrompt, normalizeOutput, type DraftRequest, type DraftOutput } from './draft'
import { validUuid } from './validation'
import { CHANNELS, type Channel, type Result } from './types'

/**
 * Draft one post per requested channel from the company profile, the offer
 * profile, the campaign objective, and whatever the author has typed.
 * Never throws; the editor shows the error string inline.
 */
export async function draftContent(companyId: string, input: DraftRequest & { campaignId: string | null }): Promise<Result<DraftOutput>> {
  try {
    if (!validUuid(companyId)) throw new Error('Choose a business first.')
    await requireCompanyAccess(companyId)
    const db = await createClient()
    const channels = [...new Set(input.channels)].filter((c): c is Channel => typeof c === 'string' && c in CHANNELS)
    if (!channels.length) throw new Error('Choose at least one channel to draft for.')
    const title = typeof input.title === 'string' ? input.title.slice(0, 180) : ''
    const brief = typeof input.brief === 'string' ? input.brief.slice(0, 6000) : ''
    if (!title.trim() && !brief.trim()) throw new Error('Give the post a title or a few notes first.')

    const [company, profile, campaign] = await Promise.all([
      db.from('companies').select('name, description, industry, website').eq('id', companyId).single(),
      loadOfferProfile(db, companyId),
      input.campaignId && validUuid(input.campaignId)
        ? db.from('platform_campaigns').select('objective').eq('id', input.campaignId).eq('company_id', companyId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (company.error || !company.data) throw new Error('Could not load the company profile.')
    const objective = campaign.data?.objective ?? ''
    const system = systemPrompt({
      companyName: company.data.name, description: company.data.description ?? '', industry: company.data.industry ?? '', website: company.data.website ?? '',
      product: profile.product, pitch: profile.pitch, audience: profile.audience, objective,
    })
    const request: DraftRequest = { title, brief, channels }
    const raw = await callClaudeJSON<unknown>('social_draft', system, userPrompt(request, objective), 4000)
    const output = raw ? normalizeOutput(raw, request) : null
    if (!output) throw new Error('The draft did not come back. Try again in a moment.')
    return { ok: true, data: output }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/ANTHROPIC_API_KEY/.test(message)) return { ok: false, error: 'AI drafting is not configured for this deployment.' }
    return { ok: false, error: message || 'The draft could not be generated. Try again.' }
  }
}
