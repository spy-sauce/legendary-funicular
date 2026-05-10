// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Per-session budget cap. Reads `organism.max_budget_usd` from a parsed
// mycelium.yaml config, or falls back to the `MYCELIUM_MAX_BUDGET_USD`
// env var for bootstrap commands (plant/map/integrate) that run before
// or independent of a parsed config object. The Claude Agent SDK
// natively supports `maxBudgetUsd` and emits a `result` message with
// subtype `error_max_budget_usd` when it trips, so this helper just
// surfaces the value to pass through to `query({ options })`.
//
// Default: unlimited (returns `undefined` so the option is omitted).
//
// CAVEAT: the cap is per-session. With `cultivate -c <n>`, up to `n`
// sessions run in parallel — total in-flight spend is `cap × n`. Set
// the cap with concurrency in mind.

const ENV_VAR = "MYCELIUM_MAX_BUDGET_USD";

export function readMaxBudgetUsd(config?: any): number | undefined {
  const fromCfg = Number(config?.organism?.max_budget_usd);
  if (Number.isFinite(fromCfg) && fromCfg > 0) return fromCfg;
  const fromEnv = Number(process.env[ENV_VAR]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return undefined;
}
