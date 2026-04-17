// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Cost estimation table (USD per million tokens).
//
// Single source of truth for token-to-USD conversion. Values are estimates
// based on published Anthropic pricing as of 2026-04 — reconcile against
// actual billing externally.
//
// Frozen contract per NUTRIENTS.md §8.

/**
 * Cost entry: USD per million tokens for each token category.
 */
export interface CostEntry {
  /** USD per million input tokens */
  input: number;
  /** USD per million output tokens */
  output: number;
  /** USD per million cache-read tokens */
  cache_read: number;
  /** USD per million cache-write tokens */
  cache_write: number;
}

/**
 * Per-model cost table. Frozen contract per NUTRIENTS.md §8.
 *
 * NOTE: These are estimates. Reconcile against actual billing externally.
 */
export const COST_TABLE: Record<string, CostEntry> = {
  "claude-opus-4-7":   { input: 15.00, output: 75.00, cache_read: 1.50,  cache_write: 18.75 },
  "claude-sonnet-4-6": { input:  3.00, output: 15.00, cache_read: 0.30,  cache_write:  3.75 },
  "claude-haiku-4-5":  { input:  1.00, output:  5.00, cache_read: 0.10,  cache_write:  1.25 },
  // fallback for unknown models
  "default":           { input:  3.00, output: 15.00, cache_read: 0.30,  cache_write:  3.75 },
};

/**
 * Get cost entry for a model, falling back to default if unknown.
 *
 * @param model - Model identifier (e.g., "claude-sonnet-4-6")
 * @returns Cost entry with per-category USD/Mtok rates
 */
export function getCost(model: string): CostEntry {
  // Direct match
  if (model in COST_TABLE) {
    return COST_TABLE[model];
  }

  // Try normalized lookup (lowercase, trimmed)
  const normalized = model.toLowerCase().trim();
  if (normalized in COST_TABLE) {
    return COST_TABLE[normalized];
  }

  // Partial match: check if any key is a prefix/suffix of the model string
  // This handles version suffixes like "claude-sonnet-4-6-20260401"
  for (const key of Object.keys(COST_TABLE)) {
    if (key !== "default" && normalized.startsWith(key)) {
      return COST_TABLE[key];
    }
  }

  // Fallback to default
  return COST_TABLE["default"];
}
