/**
 * Which templates a prospect may draw from, and the weighted draw itself.
 *
 * A template is either scoped to one campaign (`campaign_id` set) or shared
 * (`campaign_id` null). A prospect in campaign C rotates among C's own
 * templates when it has any; otherwise among the shared ones. A prospect in no
 * campaign only ever sees shared templates. An empty result means "use the
 * built-in rotation", exactly as an empty template table always has.
 *
 * Pure functions, no client: shared by enrichment (`pickTemplateDraft`) and
 * the re-draft action, and unit-testable without a database.
 */

export interface PoolTemplate {
  weight: number
  /** Undefined when the column is not readable yet (pre-migration select). */
  campaign_id?: string | null
}

export function templatesForCampaign<T extends PoolTemplate>(templates: readonly T[], campaignId: string | null | undefined): T[] {
  if (campaignId) {
    const own = templates.filter((t) => t.campaign_id === campaignId)
    if (own.length > 0) return own
  }
  return templates.filter((t) => !t.campaign_id)
}

/** Weighted random draw; `undefined` on an empty pool. */
export function pickWeighted<T extends PoolTemplate>(pool: readonly T[], random: () => number = Math.random): T | undefined {
  if (pool.length === 0) return undefined
  const total = pool.reduce((s, t) => s + Math.max(1, t.weight), 0)
  let r = random() * total
  for (const t of pool) {
    r -= Math.max(1, t.weight)
    if (r < 0) return t
  }
  return pool[pool.length - 1]
}
