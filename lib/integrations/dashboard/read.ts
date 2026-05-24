'use server'

/**
 * Server action to read a DashboardSnapshot for the active company.
 * Client components call this via the dashboard-snapshot-context.
 */

import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { getDashboardSnapshot } from './snapshot'
import type { DashboardSnapshot } from './model'

export async function readDashboardSnapshot(
  companyId: string
): Promise<DashboardSnapshot | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }
  return getDashboardSnapshot(companyId)
}
