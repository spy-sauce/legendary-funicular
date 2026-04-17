// Mycelium Framework — VibeSpace LLC — The network provides.
//
// DDP stage definitions — frozen contract.
//
// This is the canonical list of Digital Dash agentic CI/CD stages. Order matters —
// it defines the pipeline sequence. This constant is imported by:
//   - cicd-agent (emits ddp_stage_* events)
//   - dashboard-agent (renders DDP pipeline visualization)
//   - fleet-agent (queries DDP stage durations)
//
// Frozen per NUTRIENTS.md §2. Must match templates/scale.html:272-281 exactly.

import type { DDPStageId } from "./events.js";

export interface DDPStage {
  id: DDPStageId;
  label: string;
  icon: string;
}

/**
 * DDP stage list — locked, ordered pipeline definition.
 * Do not reorder or modify without coordinating across biomes.
 */
export const DDP_STAGES: ReadonlyArray<DDPStage> = [
  { id: "merge-order", label: "merge-order", icon: "M" },
  { id: "lint", label: "lint", icon: "L" },
  { id: "typecheck", label: "typecheck", icon: "T" },
  { id: "test", label: "test suite", icon: "✓" },
  { id: "build", label: "build", icon: "B" },
  { id: "deploy-stg", label: "deploy:stg", icon: "S" },
  { id: "smoke", label: "smoke tests", icon: "~" },
  { id: "deploy-prod", label: "deploy:prod", icon: "P" },
] as const;

/**
 * Lookup a stage by ID. Returns undefined if not found.
 */
export function getDDPStage(id: DDPStageId): DDPStage | undefined {
  return DDP_STAGES.find((s) => s.id === id);
}

/**
 * Validate that a stage ID is known.
 */
export function isValidDDPStageId(id: string): id is DDPStageId {
  return DDP_STAGES.some((s) => s.id === id);
}
