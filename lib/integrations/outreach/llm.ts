/**
 * Shared JSON-returning Claude helper for the outreach Stage 2/3 calls.
 *
 * Mirrors the gmail/assist callClaudeText helper (same client, same usage
 * logging, same defensive error handling) but parses a JSON object from the
 * response. Returns null on any failure — callers route null to the skip pile.
 */

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient, logUsage, type LLMUsage } from '../../llm/client'
import { pickModel, type LLMTask } from '../../llm/models'

export async function callClaudeJSON<T>(
  task: LLMTask,
  system: string,
  user: string,
  maxTokens: number,
  collect?: LLMUsage[],
): Promise<T | null> {
  let client: Anthropic
  try {
    client = getAnthropicClient()
  } catch (err) {
    console.warn(`[outreach:${task}] no client:`, err instanceof Error ? err.message : err)
    return null
  }

  const model = pickModel(task)
  const startedAt = Date.now()

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system,
      messages: [{ role: 'user', content: user }],
    })

    const usage: LLMUsage = {
      task,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      durationMs: Date.now() - startedAt,
    }
    logUsage(usage)
    collect?.push(usage)

    const block = response.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') return null
    const text = block.text.trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end < 0) return null
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.warn(`[outreach:${task}] API error ${err.status}: ${err.message}`)
    } else {
      console.warn(`[outreach:${task}] error:`, err instanceof Error ? err.message : err)
    }
    return null
  }
}
