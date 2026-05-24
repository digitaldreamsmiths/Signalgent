'use server'

/**
 * Server action to read a MarketingSnapshot for the active company.
 * Client components call this via the marketing-snapshot-context.
 */

import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { getMarketingSnapshot } from '@/lib/integrations/pinterest/snapshot'
import type { MarketingSnapshot } from '@/lib/integrations/marketing/model'

export async function readMarketingSnapshot(
  companyId: string
): Promise<MarketingSnapshot | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }
  return getMarketingSnapshot(companyId)
}
