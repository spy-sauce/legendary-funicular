// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Micro-agent public surface — re-exports + shared singleton.
//
// Contract: NUTRIENTS.md §2 (MicroState), §4 (MicroAgent fan-out)
// Sub-agent: cache.micros.index
//
// This barrel re-exports the spawn function, its options interface,
// and the MicroRegistry class. It also provides a module-level singleton
// `microRegistry` for the integration biome to share without passing
// references through cultivate.ts.
//
// Consumers:
// - cache-network-integration: imports `microRegistry` singleton, calls
//   registerLeaf(leaf) at leaf-active and clear() on iter advance
// - dashboard-data: imports `microRegistry` singleton, calls getMicros(leafId)
//   to populate LeafState.micros[]

// Re-export spawn function and types
export { spawnMicros, MicroSpawnOpts, MicroState } from "./spawn.js";

// Re-export registry class
export { MicroRegistry } from "./registry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared singleton — per NUTRIENTS §4 + HYPHA spec
// ─────────────────────────────────────────────────────────────────────────────

import { MicroRegistry } from "./registry.js";

/**
 * Module-level singleton MicroRegistry instance.
 *
 * Per NUTRIENTS §4: "integration biome wires a singleton via index.ts"
 *
 * This singleton is shared across the cultivation — cache-network-integration
 * calls registerLeaf at leaf-active and clear() on iter advance, while
 * dashboard-data calls getMicros to populate LeafState.micros[].
 *
 * Do not instantiate additional MicroRegistry instances unless you have
 * a specific reason to maintain a separate registry (e.g., testing).
 */
export const microRegistry = new MicroRegistry();
