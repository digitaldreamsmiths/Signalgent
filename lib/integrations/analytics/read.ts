'use server'

/**
 * Server action to read an AnalyticsSnapshot for the active company.
 * Client components call this via the analytics-snapshot-context.
 */

import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { getAnalyticsSnapshot } from '@/lib/integrations/ga/snapshot'
import type { AnalyticsSnapshot } from '@/lib/integrations/analytics/model'

export async function readAnalyticsSnapshot(
  companyId: string
): Promise<AnalyticsSnapshot | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }
  return getAnalyticsSnapshot(companyId)
}
