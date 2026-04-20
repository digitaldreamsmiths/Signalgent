/**
 * LLM-powered email assist: summarize a thread + draft a reply.
 *
 * Both operate on the same `ThreadContext` (see `./threadContext.ts`) and
 * both route through Claude Sonnet 4.6 with adaptive thinking. The difference
 * is in the system prompt, output shape, and caching policy:
 *
 *   - summarize — cached per-thread by the thread-context fingerprint, 10 min.
 *     Same inputs → same output → no point re-paying Sonnet.
 *   - draft — NOT cached. The user explicitly wants fresh drafts, and a
 *     cached draft would defeat the "give me a different angle" use case.
 *
 * Prompt caching (Sonnet's 2048-token min) is deliberately skipped in v1 —
 * our system prompts are under 500 tokens each and the per-thread context
 * varies, so there's no stable prefix that would hit the minimum. The
 * threadContext cache already covers the expensive work (thread fetch +
 * MIME extraction); the Sonnet call on a cache miss is the only new cost.
 *
 * Both functions return null on any failure so the UI degrades cleanly
 * (disabled button + inline error). The caller is a server action that
 * surfaces the null with a friendly message.
 */

import Anthropic from '@anthropic-ai/sdk'
import { cache } from '../cache'
import { getAnthropicClient, logUsage } from '../../llm/client'
import { pickModel } from '../../llm/models'
import { getThreadContext, type ThreadContext } from './threadContext'

const SUMMARY_CACHE_TTL_SEC = 10 * 60

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const SUMMARY_SYSTEM_PROMPT = `You summarize an email thread for a busy founder who hasn't read it yet.

Rules:
- 2–4 short sentences. Newsletter-length, not novella-length.
- Lead with what the counterparty wants (ask, question, blocker).
- Mention any deadlines or dollar figures verbatim.
- If the founder has already replied in the thread, note where the ball currently sits — "you replied", "waiting on them", "no reply yet".
- Skip pleasantries, signatures, disclaimers, unsubscribe footers, and promotional boilerplate.
- Do NOT invent facts. If something is ambiguous, say so.

Output plain text. No bullet points, no headers, no "Summary:" prefix.`

const DRAFT_SYSTEM_PROMPT = `You draft a reply to an email thread on behalf of the mailbox owner (a founder).

Rules:
- Match the thread's tone — casual if the counterparty is casual, formal if they are.
- Address the counterparty's actual ask. If there are multiple, address the main one and flag the rest.
- Keep it tight: 2–5 short sentences unless the thread clearly calls for more.
- Sign off with just the owner's first name if you can infer it from the thread; otherwise no sign-off.
- Do NOT include the subject line, "Dear …" salutation, or email headers — just the reply body.
- Do NOT invent facts (pricing, timelines, commitments). If a commitment is needed, leave a bracketed placeholder like [confirm date].
- If the thread is promotional, transactional, or the owner has already replied and nothing new has come back, return exactly the single word: NONE

Output the draft body as plain text. No quoted original, no "Hi [Name]," template.`

function renderThreadForPrompt(ctx: ThreadContext): string {
  const lines: string[] = []
  lines.push(`Mailbox owner: ${ctx.ownerEmail}`)
  lines.push(`Thread ID: ${ctx.threadId}`)
  lines.push(`Messages (oldest first):`)
  lines.push('')
  ctx.messages.forEach((m, i) => {
    const who = m.sentByOwner ? '(sent by owner)' : '(inbound)'
    lines.push(`--- Message ${i + 1} ${who} ---`)
    lines.push(`From: ${m.from}`)
    if (m.to) lines.push(`To: ${m.to}`)
    lines.push(`Date: ${m.receivedAt}`)
    lines.push(`Subject: ${m.subject}`)
    if (m.attachments.length > 0) {
      lines.push(`Attachments: ${m.attachments.join(', ')}`)
    }
    lines.push('')
    lines.push(m.body || '(empty body)')
    lines.push('')
  })
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Shared call helper
// ---------------------------------------------------------------------------

interface LLMCallArgs {
  task: 'summary' | 'recommendation'
  system: string
  user: string
  maxTokens: number
}

async function callClaudeText(args: LLMCallArgs): Promise<string | null> {
  let client: Anthropic
  try {
    client = getAnthropicClient()
  } catch (err) {
    console.warn('[assist] skipping:', err instanceof Error ? err.message : err)
    return null
  }

  const model = pickModel(args.task)
  const startedAt = Date.now()

  try {
    const response = await client.messages.create({
      model,
      max_tokens: args.maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: args.system,
      messages: [{ role: 'user', content: args.user }],
    })

    logUsage({
      task: args.task,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      durationMs: Date.now() - startedAt,
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.warn(`[assist:${args.task}] no text block in response`)
      return null
    }
    return textBlock.text.trim()
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.warn(`[assist:${args.task}] API error ${err.status}: ${err.message}`)
    } else {
      console.warn(`[assist:${args.task}] error:`, err instanceof Error ? err.message : err)
    }
    return null
  }
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export interface ThreadSummary {
  summary: string
}

export interface ThreadDraft {
  draft: string | null // null when the model returns "NONE" (nothing to draft)
}

function summaryCacheKey(companyId: string, ctx: ThreadContext): string {
  // Same fingerprint as thread-context — if context is cache-reused,
  // summary reuses too. If context rebuilds (new message), summary
  // auto-invalidates.
  const ids = ctx.messages.map((m) => m.id).sort().join(',')
  return `gmail:thread-summary:${companyId}:${ctx.threadId}:${ids}`
}

export async function summarizeThread(
  companyId: string,
  threadId: string
): Promise<ThreadSummary | null> {
  const ctx = await getThreadContext(companyId, threadId)
  if (!ctx) return null

  const cacheKey = summaryCacheKey(companyId, ctx)
  const cached = await cache.get<ThreadSummary>(cacheKey)
  if (cached) return cached

  const text = await callClaudeText({
    task: 'summary',
    system: SUMMARY_SYSTEM_PROMPT,
    user: renderThreadForPrompt(ctx),
    maxTokens: 2048,
  })
  if (!text) return null

  const result: ThreadSummary = { summary: text }
  await cache.set(cacheKey, result, SUMMARY_CACHE_TTL_SEC)
  return result
}

export async function draftReply(
  companyId: string,
  threadId: string
): Promise<ThreadDraft | null> {
  const ctx = await getThreadContext(companyId, threadId)
  if (!ctx) return null

  const text = await callClaudeText({
    task: 'recommendation',
    system: DRAFT_SYSTEM_PROMPT,
    user: renderThreadForPrompt(ctx),
    maxTokens: 4096,
  })
  if (text === null) return null
  if (text === 'NONE') return { draft: null }
  return { draft: text }
}
