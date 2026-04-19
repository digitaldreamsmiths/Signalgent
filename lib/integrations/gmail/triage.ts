/**
 * LLM-driven email triage.
 *
 * Takes the recent messages from a Gmail snapshot and classifies each
 * into urgent / opportunity / canWait in a single Claude API call,
 * using tool use to force a structured response.
 *
 * Cache key is derived from the sorted message IDs in the batch, so any
 * new inbound message auto-invalidates. TTL is 5 min — longer than the
 * snapshot cache (2 min) since the same message set will usually
 * re-classify identically.
 *
 * Returns null on any error (missing API key, network, malformed
 * response). Callers should treat null as "triage unavailable" and fall
 * back to heuristic priority.
 */

import { createHash } from 'crypto'
import type Anthropic from '@anthropic-ai/sdk'
import { cache } from '../cache'
import type {
  CommunicationsMessage,
  PriorityBreakdown,
} from '../comms/model'
import { getAnthropicClient, logUsage } from '../../llm/client'
import { pickModel } from '../../llm/models'

const TRIAGE_TTL_SEC = 5 * 60
const TRIAGE_TOOL_NAME = 'classify_emails'

type TriagedBucket = 'urgent' | 'opportunity' | 'canWait'

export interface TriageResult {
  /** Map from message ID → bucket. */
  byId: Record<string, TriagedBucket>
  breakdown: PriorityBreakdown
}

interface ClassifyToolInput {
  classifications: Array<{ id: string; priority: TriagedBucket }>
}

function cacheKey(companyId: string, messages: CommunicationsMessage[]): string {
  const ids = messages.map((m) => m.id).sort().join(',')
  const hash = createHash('sha256').update(ids).digest('hex').slice(0, 16)
  return `gmail:triage:${companyId}:${hash}`
}

function buildUserPrompt(messages: CommunicationsMessage[]): string {
  const items = messages.map((m) => ({
    id: m.id,
    from: m.sender.name ? `${m.sender.name} <${m.sender.email}>` : m.sender.email,
    subject: m.subject,
    snippet: m.snippet.slice(0, 400),
    receivedAt: m.receivedAt,
    unread: m.unread,
  }))
  return `Classify each email below. Return one entry per id.\n\n${JSON.stringify(
    items,
    null,
    2
  )}`
}

const SYSTEM_PROMPT = `You triage a busy founder's inbox. For each email, choose one bucket:

- "urgent": needs a reply or action within 24 hours — customer problems, contract deadlines, investor asks, legal notices, anything time-sensitive from a real human counterparty.
- "opportunity": worth reading soon but not urgent — warm intros, prospect replies, partnership outreach, press, anything that moves the business forward when acted on.
- "canWait": promotional, transactional, automated, newsletters, notifications, receipts, or anything a founder can safely skip or batch later.

Be skeptical. Marketing emails that pretend to be personal are "canWait". A one-line "thanks!" is "canWait". When unsure between urgent and opportunity, choose opportunity. When unsure between opportunity and canWait, choose canWait.

Return classifications via the classify_emails tool. Include every id exactly once.`

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: TRIAGE_TOOL_NAME,
  description:
    'Return the priority classification for every email in the batch. Include every id exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      classifications: {
        type: 'array',
        description: 'One entry per email, matched by id.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The email id from the input list.',
            },
            priority: {
              type: 'string',
              enum: ['urgent', 'opportunity', 'canWait'],
              description: 'The triage bucket for this email.',
            },
          },
          required: ['id', 'priority'],
        },
      },
    },
    required: ['classifications'],
  },
}

function computeBreakdown(byId: Record<string, TriagedBucket>): PriorityBreakdown {
  const out: PriorityBreakdown = { urgent: 0, opportunity: 0, canWait: 0 }
  for (const bucket of Object.values(byId)) {
    out[bucket] += 1
  }
  return out
}

/**
 * Classify a batch of messages into priority buckets.
 *
 * Returns null when:
 *  - the input is empty
 *  - ANTHROPIC_API_KEY is missing
 *  - the API call or tool-output parsing fails
 *
 * Callers should degrade to the heuristic priority on null.
 */
export async function triageMessages(
  companyId: string,
  messages: CommunicationsMessage[],
  options: { modelOverride?: string } = {}
): Promise<TriageResult | null> {
  if (messages.length === 0) return null

  const key = cacheKey(companyId, messages)
  const cached = await cache.get<TriageResult>(key)
  if (cached) return cached

  let client: Anthropic
  try {
    client = getAnthropicClient()
  } catch (err) {
    // Missing API key — log once and return null so the UI degrades.
    console.warn('[triage] skipping:', err instanceof Error ? err.message : err)
    return null
  }

  const model = pickModel('triage', options.modelOverride)
  const startedAt = Date.now()

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: TRIAGE_TOOL_NAME },
      messages: [{ role: 'user', content: buildUserPrompt(messages) }],
    })

    logUsage({
      task: 'triage',
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      durationMs: Date.now() - startedAt,
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== TRIAGE_TOOL_NAME) {
      console.warn('[triage] no tool_use block in response')
      return null
    }

    const parsed = toolUse.input as ClassifyToolInput
    if (!parsed || !Array.isArray(parsed.classifications)) {
      console.warn('[triage] malformed tool input')
      return null
    }

    const byId: Record<string, TriagedBucket> = {}
    for (const entry of parsed.classifications) {
      if (
        typeof entry?.id === 'string' &&
        (entry.priority === 'urgent' ||
          entry.priority === 'opportunity' ||
          entry.priority === 'canWait')
      ) {
        byId[entry.id] = entry.priority
      }
    }

    const result: TriageResult = { byId, breakdown: computeBreakdown(byId) }
    await cache.set(key, result, TRIAGE_TTL_SEC)
    return result
  } catch (err) {
    console.warn('[triage] error:', err instanceof Error ? err.message : err)
    return null
  }
}
