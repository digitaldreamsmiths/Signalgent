'use server'

/**
 * Server actions for LLM-powered email assist.
 *
 * Called from the EmailClient widget preview pane. Both enforce
 * requireCompanyAccess before touching the mailbox. Returns a discriminated
 * union so the client can distinguish between:
 *
 *   - ok + body (successful LLM output)
 *   - ok + body null (model said "nothing to draft here" — show friendly empty state)
 *   - error + message (auth / upstream / LLM failure — show inline error)
 *
 * The error message is never an upstream exception — it's a short,
 * user-facing string the widget can render verbatim.
 */

import { IntegrationAuthError, requireCompanyAccess } from '@/lib/integrations/auth'
import { summarizeThread, draftReply } from '@/lib/integrations/gmail/assist'

export type AssistResult<T> =
  | { ok: true; body: T | null }
  | { ok: false; error: string }

export async function summarizeEmailThread(
  companyId: string,
  threadId: string
): Promise<AssistResult<{ summary: string }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return { ok: false, error: 'You don\u2019t have access to this workspace.' }
    }
    throw err
  }

  const result = await summarizeThread(companyId, threadId)
  if (!result) {
    return { ok: false, error: 'Couldn\u2019t summarize this thread. Try again in a moment.' }
  }
  return { ok: true, body: { summary: result.summary } }
}

export async function draftEmailReply(
  companyId: string,
  threadId: string
): Promise<AssistResult<{ draft: string }>> {
  try {
    await requireCompanyAccess(companyId)
  } catch (err) {
    if (err instanceof IntegrationAuthError) {
      return { ok: false, error: 'You don\u2019t have access to this workspace.' }
    }
    throw err
  }

  const result = await draftReply(companyId, threadId)
  if (!result) {
    return { ok: false, error: 'Couldn\u2019t draft a reply. Try again in a moment.' }
  }
  if (result.draft === null) {
    return { ok: true, body: null }
  }
  return { ok: true, body: { draft: result.draft } }
}
