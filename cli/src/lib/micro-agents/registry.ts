// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Micro-agent registry — per-cultivation MicroRegistry storing spawned micros by leaf.
//
// Contract: NUTRIENTS.md §2 (MicroState), §4 (MicroAgent fan-out)
// Sub-agent: cache.micros.registry
//
// The registry is idempotent: calling registerLeaf with the same leafId returns
// the previously stored micros without re-spawning. getMicros returns an empty
// array for unregistered leaves (never throws). clear() drops all entries.
//
// Consumed by:
// - cache-network-integration: calls registerLeaf(leaf) at leaf-active
// - dashboard-data: calls getMicros(leafId) to populate LeafState.micros[]

import { spawnMicros, MicroState, MicroSpawnOpts } from "./spawn.js";

// ─────────────────────────────────────────────────────────────────────────────
// MicroRegistry — per-cultivation registry for spawned micro-agents
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry for micro-agents, keyed by leafId.
 *
 * Per NUTRIENTS §4: integration biome wires a singleton via index.ts.
 * This class provides idempotent registration — calling registerLeaf
 * with the same leafId returns the already-stored array (no re-spawn).
 */
export class MicroRegistry {
  /**
   * Backing store: Map from leafId → spawned MicroState array.
   */
  private store: Map<string, MicroState[]>;

  constructor() {
    this.store = new Map();
  }

  /**
   * Register a leaf and spawn its micro-agents.
   *
   * If the leaf.id has already been registered, returns the existing
   * MicroState array without re-spawning (idempotent).
   *
   * If the leaf.id is new, calls spawnMicros to create 2-4 micros
   * with deterministic routing, stores them, and returns the array.
   *
   * @param leaf - Object with id and optional severity
   * @returns Array of MicroState for this leaf
   */
  registerLeaf(leaf: { id: string; severity?: "critical" | "major" | "minor" }): MicroState[] {
    const existing = this.store.get(leaf.id);
    if (existing !== undefined) {
      return existing;
    }

    // Spawn micros for new leaf
    const opts: MicroSpawnOpts = {
      leafId: leaf.id,
      severity: leaf.severity,
    };
    const micros = spawnMicros(opts);

    this.store.set(leaf.id, micros);
    return micros;
  }

  /**
   * Get the micro-agents for a registered leaf.
   *
   * Returns the stored MicroState array, or an empty array if the
   * leafId was never registered. Never throws.
   *
   * @param leafId - The leaf identifier
   * @returns Array of MicroState, or empty array if not registered
   */
  getMicros(leafId: string): MicroState[] {
    return this.store.get(leafId) ?? [];
  }

  /**
   * Clear all registered leaves and their micro-agents.
   *
   * Called by cultivation reset or heal-loop iter advance handler
   * in cache-network-integration.
   */
  clear(): void {
    this.store.clear();
  }
}
