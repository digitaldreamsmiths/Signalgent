/**
 * Client-safe publishing rules. The editor imports these to decide whether
 * the Publish button can be pressed; lib/platform/publish.ts applies the same
 * rules on the server before any provider call. No I/O, no server imports.
 */

import { CHANNELS, type ContentItem } from './types'

export function linkedinText(item: Pick<ContentItem, 'body' | 'variants'>): string {
  return (item.variants?.linkedin ?? item.body ?? '').trim()
}

/** Why this item cannot go to LinkedIn right now, or null when it can. */
export function linkedinBlocker(item: Pick<ContentItem, 'body' | 'variants' | 'channels' | 'status'>): string | null {
  if (!item.channels.includes('linkedin')) return 'Add LinkedIn as a channel first.'
  if (item.status !== 'approved' && item.status !== 'planned') return 'Mark the post approved or planned before publishing.'
  const text = linkedinText(item)
  if (!text) return 'Add text for LinkedIn before publishing.'
  if (text.length > CHANNELS.linkedin.limit) return `LinkedIn allows ${CHANNELS.linkedin.limit.toLocaleString()} characters. Shorten the LinkedIn version first.`
  return null
}
