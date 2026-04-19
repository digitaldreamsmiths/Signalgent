/**
 * LLM model selection.
 *
 * Static task → model map. Triage goes to Haiku (cheap/fast, high volume);
 * summary and recommendation go to Sonnet (nuance and judgment, lower
 * volume). The override hook lets callers force a specific model for
 * evals or debugging without touching the map.
 *
 * Bump entries here when real cost/quality data argues for a different
 * default. Avoid adaptive escalation (retry on low-confidence with a
 * bigger model) until we have data showing the default misclassifies a
 * meaningful slice — the second call doubles latency for marginal gain.
 */

export type LLMTask = 'triage' | 'summary' | 'recommendation'

const TASK_MODELS: Record<LLMTask, string> = {
  triage: 'claude-haiku-4-5',
  summary: 'claude-sonnet-4-6',
  recommendation: 'claude-sonnet-4-6',
}

export function pickModel(task: LLMTask, override?: string): string {
  return override ?? TASK_MODELS[task]
}
