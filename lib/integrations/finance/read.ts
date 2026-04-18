'use server'

/**
 * Server action to read a FinanceSnapshot for the active company.
 * Client components call this via the finance-snapshot-context.
 */

import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { getFinanceSnapshot } from '@/lib/integrations/stripe/snapshot'
import type { FinanceSnapshot } from '@/lib/integrations/finance/model'

export async function readFinanceSnapshot(
  companyId: string
): Promise<FinanceSnapshot | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }
  return getFinanceSnapshot(companyId)
}
