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

export type LLMTask =
  | 'triage'
  | 'summary'
  | 'recommendation'
  | 'resolve'
  | 'synthesis'
  | 'draft'

const TASK_MODELS: Record<LLMTask, string> = {
  triage: 'claude-haiku-4-5',
  summary: 'claude-sonnet-4-6',
  recommendation: 'claude-sonnet-4-6',
  // Domain→company-name segmentation/adjudication for the outreach resolver.
  // Cheap, high-volume, low-nuance → Haiku, same tier as triage.
  resolve: 'claude-haiku-4-5',
  // Outreach Stage 2/3. Both are judgment-heavy and low-volume (gated to one
  // call per qualified prospect), and draft quality is the whole product — Sonnet.
  synthesis: 'claude-sonnet-4-6',
  draft: 'claude-sonnet-4-6',
}

export function pickModel(task: LLMTask, override?: string): string {
  return override ?? TASK_MODELS[task]
}
