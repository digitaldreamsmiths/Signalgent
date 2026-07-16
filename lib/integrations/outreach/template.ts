/**
 * Generic fallback template for prospects that can't be personalized (no
 * USASpending match, low-confidence identity, or too thin to synthesize an
 * angle). Instead of dropping them, we attach a sendable generic email.
 *
 * Crucially this is NOT fake personalization: the template makes ZERO
 * company-specific factual claims (empty facts_for_draft is also how the queue
 * tells a template apart from a personalized draft). It only optionally
 * addresses the company by its resolved name when we have one. Same register as
 * the personalized draft, dash-sanitized.
 */

import { sanitizeDashes, SENDER } from './draft'
import type { DraftResult } from './types'

/** Render a user-authored template into a sendable draft. Substitutes the
 * `{company}` placeholder with the resolved recipient name (or a neutral
 * fallback), and dash-sanitizes like the personalized path. Makes no factual
 * claims of its own — that's the author's responsibility. */
export function renderTemplate(tmpl: { subject: string; body: string }, recipientName?: string | null): DraftResult {
  const who = recipientName?.trim() || 'your team'
  const fill = (s: string) => sanitizeDashes(s.replace(/\{company\}/gi, who))
  return { subject: fill(tmpl.subject), body: fill(tmpl.body), facts_used: [] }
}

export function buildTemplateDraft(recipientName?: string | null): DraftResult {
  const subject = recipientName
    ? `A lighter proposal load for ${recipientName}`
    : 'A lighter proposal load for your team'

  const body = sanitizeDashes(
    [
      'Hi,',
      '',
      `I work with government contractors who are tightening how they pursue federal work, and wanted to put ${SENDER.product} on your radar. It is a tool the contractors using it lean on to carry the heavy part of proposal and capture work, the solicitation shredding, the compliant first drafts, the past performance wrangling, while their team keeps full control of strategy and voice.`,
      '',
      'The idea is simple. The busywork drops and the decisions stay yours.',
      '',
      'If easing the proposal load is something on your mind heading into your next pursuit, I am happy to share how other firms are using it.',
      '',
      'Either way, wishing you a strong run on your upcoming bids.',
      '',
      `${SENDER.signOff},`,
      SENDER.signatureName,
      SENDER.site,
    ].join('\n'),
  )

  return { subject, body, facts_used: [] }
}

/**
 * Generic follow-up nudge for a prospect we couldn't personalize. Same register
 * as the initial template, shorter, no fabricated claims, no guilt-tripping.
 */
export function buildTemplateFollowup(recipientName?: string | null): DraftResult {
  const subject = recipientName
    ? `Following up: a lighter proposal load for ${recipientName}`
    : 'Following up: a lighter proposal load for your team'

  const body = sanitizeDashes(
    [
      'Hi,',
      '',
      `I reached out a little while ago about ${SENDER.product} and wanted to put it back on your radar once more.`,
      '',
      'Short version: the contractors using it lean on it to carry the heavy part of proposal and capture work while keeping full control of strategy and voice. The busywork drops, the decisions stay yours.',
      '',
      'If easing the proposal load is on your mind for an upcoming pursuit, I am glad to share how other firms are using it. No worries either way.',
      '',
      `${SENDER.signOff},`,
      SENDER.signatureName,
      SENDER.site,
    ].join('\n'),
  )

  return { subject, body, facts_used: [] }
}
