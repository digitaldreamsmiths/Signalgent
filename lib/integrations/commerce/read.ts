'use server'

/**
 * Server action to read a CommerceSnapshot for the active company.
 * Client components call this via the commerce-snapshot-context.
 */

import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { getCommerceSnapshot } from '@/lib/integrations/etsy/snapshot'
import type { CommerceSnapshot } from '@/lib/integrations/commerce/model'

export async function readCommerceSnapshot(
  companyId: string
): Promise<CommerceSnapshot | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }
  return getCommerceSnapshot(companyId)
}
