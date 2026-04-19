/**
 * Communications snapshot orchestration (Gmail-backed).
 *
 * Composes tokens + fetch + normalize + cache + status updates. This is
 * the single entry point that server actions/components call to get a
 * live CommunicationsSnapshot for a given company.
 *
 * Returns null when the company has no connected Gmail account (widgets
 * fall back to mock in that case). Any provider error is caught, flagged
 * on the account row, and returned as null so the UI degrades cleanly.
 */

import { cache } from '../cache'
import { markSynced } from '../accounts'
import type { CommunicationsSnapshot } from '../comms/model'
import {
  getGmailProfile,
  getMessage,
  listMessages,
  type GmailMessage,
} from './fetch'
import { normalizeToSnapshot } from './normalize'
import { GMAIL_SERVICE, loadGmailCredentials, markGmailError } from './tokens'

const SNAPSHOT_TTL_SEC = 2 * 60 // 2 minutes — email feels more "live" than finance
const RECENT_MESSAGE_COUNT = 15 // enough for the list widget preview

function snapshotKey(companyId: string): string {
  return `gmail:snapshot:${companyId}`
}

export async function getCommunicationsSnapshot(
  companyId: string
): Promise<CommunicationsSnapshot | null> {
  // 1. Cache hit?
  const cached = await cache.get<CommunicationsSnapshot>(snapshotKey(companyId))
  if (cached) return cached

  // 2. Credentials?
  const creds = await loadGmailCredentials(companyId)
  if (!creds) return null

  // 3. Fetch + normalize
  try {
    const { accessToken } = creds

    // Three parallel list calls: recent inbox (for message preview), unread
    // count, and active-thread count (last 7d). All three just need the
    // message list, not full bodies.
    const [profile, recentList, unreadList, activeList] = await Promise.all([
      getGmailProfile(accessToken),
      listMessages({
        accessToken,
        q: 'in:inbox',
        maxResults: RECENT_MESSAGE_COUNT,
      }),
      listMessages({
        accessToken,
        q: 'is:unread in:inbox',
        maxResults: 1, // we only need resultSizeEstimate
      }),
      listMessages({
        accessToken,
        q: 'newer_than:7d in:inbox',
        maxResults: 100, // pull enough to count distinct threadIds
      }),
    ])

    // Fetch metadata for each recent message in parallel. Batch-limit to
    // RECENT_MESSAGE_COUNT so we never blow up on a huge inbox.
    const recentRefs = recentList.messages ?? []
    const messages: GmailMessage[] = await Promise.all(
      recentRefs.map((ref) =>
        getMessage({
          accessToken,
          id: ref.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date', 'To'],
        })
      )
    )

    // Distinct thread count from the 7d list.
    const threadIds = new Set<string>()
    for (const ref of activeList.messages ?? []) {
      threadIds.add(ref.threadId)
    }

    const snapshot = normalizeToSnapshot({
      profile,
      messages,
      totalUnread: unreadList.resultSizeEstimate ?? 0,
      threadsActive: threadIds.size,
    })

    await cache.set(snapshotKey(companyId), snapshot, SNAPSHOT_TTL_SEC)
    await markSynced(companyId, GMAIL_SERVICE)
    return snapshot
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await markGmailError(companyId, msg)
    return null
  }
}

export async function invalidateCommunicationsSnapshot(companyId: string): Promise<void> {
  await cache.invalidate(`gmail:snapshot:${companyId}`)
}
