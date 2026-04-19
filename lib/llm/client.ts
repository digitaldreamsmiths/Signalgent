/**
 * Anthropic SDK client — lazy singleton.
 *
 * Every LLM caller (triage, summary, etc.) goes through getAnthropicClient()
 * so we get one SDK instance and one place to add observability. The client
 * reads ANTHROPIC_API_KEY lazily — safe to import from client modules as
 * long as the client is only used inside server actions / API routes.
 *
 * logUsage() reports token counts for each request. Cache hit rate lives
 * in cache_read_input_tokens — if it stays zero on repeated requests with
 * an identical prefix, a silent invalidator is in the prompt (see the
 * shared/prompt-caching.md audit in the Claude API skill).
 */

import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env.local and to Vercel env vars.'
    )
  }
  _client = new Anthropic({ apiKey })
  return _client
}

export interface LLMUsage {
  task: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  durationMs: number
}

export function logUsage(u: LLMUsage): void {
  // Single-line console log — Vercel captures these and we can grep/sum
  // by task. When traffic justifies it, pipe to a metrics sink here.
  console.log(
    `[llm] task=${u.task} model=${u.model} in=${u.inputTokens} out=${u.outputTokens} ` +
      `cacheRead=${u.cacheReadTokens} cacheWrite=${u.cacheWriteTokens} ms=${u.durationMs}`
  )
}
