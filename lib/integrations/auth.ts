/**
 * Authorization helper for integration routes and server actions.
 *
 * Every connect, callback, fetcher, and disconnect flow must call
 * requireCompanyAccess at the top. It confirms:
 *   1. A session exists (user is authenticated)
 *   2. The user is a member of the workspace that owns the company
 *
 * On failure it throws an IntegrationAuthError with a status code. Callers
 * in route handlers should catch and translate to a redirect or 403.
 */

import { createClient } from '@/lib/supabase/server'

export class IntegrationAuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'IntegrationAuthError'
    this.status = status
  }
}

export interface CompanyAccess {
  userId: string
  workspaceId: string
  companyId: string
}

export async function requireCompanyAccess(companyId: string): Promise<CompanyAccess> {
  if (!companyId) {
    throw new IntegrationAuthError('Missing companyId', 400)
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new IntegrationAuthError('Not authenticated', 401)
  }

  // Confirm the company exists and the user belongs to its workspace.
  // RLS would already block cross-workspace reads, but we want an
  // explicit 403 rather than a silent empty result.
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, workspace_id')
    .eq('id', companyId)
    .maybeSingle()

  if (companyError) {
    throw new IntegrationAuthError(`Company lookup failed: ${companyError.message}`, 500)
  }
  if (!company) {
    throw new IntegrationAuthError('Company not found or access denied', 403)
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', company.workspace_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    throw new IntegrationAuthError(`Membership check failed: ${membershipError.message}`, 500)
  }
  if (!membership) {
    throw new IntegrationAuthError('User is not a member of this workspace', 403)
  }

  return {
    userId: user.id,
    workspaceId: company.workspace_id,
    companyId: company.id,
  }
}
