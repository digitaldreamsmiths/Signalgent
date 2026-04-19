'use server'

/**
 * Server action to read a CommunicationsSnapshot for the active company.
 * Client components call this via the communications-snapshot-context.
 */

import { requireCompanyAccess, IntegrationAuthError } from '@/lib/integrations/auth'
import { getCommunicationsSnapshot } from '@/lib/integrations/gmail/snapshot'
import type { CommunicationsSnapshot } from '@/lib/integrations/comms/model'

export async function readCommunicationsSnapshot(
  companyId: string
): Promise<CommunicationsSnapshot | null> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) return null
    throw err
  }
  return getCommunicationsSnapshot(companyId)
}
