// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Framework upgrade plugin types.
//
// Upgrades are opt-in, generic, installable capabilities — Cyberpunk-style chrome
// for your organism. An organism declares which upgrades are active in its
// mycelium.yaml under `organism.upgrades`; the CLI resolves, loads, and fires
// hooks at the right lifecycle points during cultivate.
//
// Each upgrade is a plain TS module that default-exports an `Upgrade` object:
// a manifest plus any subset of the lifecycle hooks below.

export interface LeafLike {
  id: string;
  scope: string;
  branch: string;
  /** biome → ... → leaf path */
  lineage: string[];
  biome: string;
}

export interface LeafResultLike {
  leaf: LeafLike;
  success: boolean;
  artifacts: string[];
  error?: string;
  ms: number;
  logPath?: string;
}

export interface UpgradeCtx {
  organism: any;
  agents: any[];
  /** Mutable. beforePlan hooks may filter; downstream hooks see the filtered set. */
  leaves: LeafLike[];
  config: any;
  targetDir: string;
  /** Populated after log dir is created; empty during beforePlan. */
  runLogDir: string;
}

export type UpgradeCategory =
  | "runtime"
  | "validation"
  | "convention"
  | "template";

export interface UpgradeManifest {
  name: string;
  description: string;
  category: UpgradeCategory;
  /** Names of other upgrades that cannot coexist with this one. */
  conflicts?: string[];
}

export interface PlanDecision {
  /** If true, cultivate aborts before spawning any leaves. */
  abort?: boolean;
  /** Reason displayed to the user on abort. */
  reason?: string;
  /** Non-fatal advisories. */
  warnings?: string[];
}

export interface SpawnDecision {
  /** If true, this leaf is skipped (counted as success, no SDK session). */
  skip?: boolean;
  skipReason?: string;
}

export interface Upgrade {
  manifest: UpgradeManifest;
  /** Fires after leaves are flattened, before execution. Validators live here. */
  beforePlan?: (ctx: UpgradeCtx) => Promise<PlanDecision | void>;
  /** Fires before each leaf's SDK session is created. Return { skip: true } to bypass. */
  beforeSpawn?: (
    ctx: UpgradeCtx,
    leaf: LeafLike
  ) => Promise<SpawnDecision | void>;
  /** Transforms the prompt sent to a leaf's SDK session. Chained across upgrades in install order. */
  transformPrompt?: (
    ctx: UpgradeCtx,
    leaf: LeafLike,
    prompt: string
  ) => Promise<string>;
  /** Fires after a leaf fruits or fails. Best place to record state. */
  afterLeaf?: (
    ctx: UpgradeCtx,
    leaf: LeafLike,
    result: LeafResultLike
  ) => Promise<void>;
  /** Fires if cultivate catches an outer error. Best-effort — do not throw here. */
  onCrash?: (ctx: UpgradeCtx, err: unknown) => Promise<void>;
}
