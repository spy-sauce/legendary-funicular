// Mycelium Framework — VibeSpace LLC — The network provides.
//
// audit.cli.orchestrator — Wires loadTesters → runTestersInPool → aggregate
// → composeBriefFix → writeSummary. Embedded in cli/src/commands/audit-run.ts
// action handler. Respects --only-tester, --concurrency, --against flags.
//
// Scope: NUTRIENTS.md §§1,2,4,5 consumption; §7 flag handling.
// Does NOT modify cultivate.ts (framework rule #2).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ── Imports from sibling biomes ─────────────────────────────────────────────
// These modules are created by parallel leaves in this cultivation.
// If they don't exist yet at compile time, tsc will fail — that's intentional;
// merge order guarantees audit-findings, audit-testers, audit-aggregator
// all ship before audit-cli.

import type { Finding } from "./findings.js";
import type { TesterDef, TesterResult } from "./testers.js";
import { loadTesters, filterTesters } from "./testers-loader.js";
import { runTestersInPool } from "./testers-pool.js";
import { aggregate } from "./aggregator.js";
import { composeBriefFix } from "./aggregator-brief.js";
import { writeSummary } from "./aggregator-summary.js";
import { writeAuditBlock, drainAuditStateWrites } from "./sporenet-integration.js";
import { runHealLoop } from "./heal-loop.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface OrchestratorOptions {
  cultivationDir: string;
  autofix: boolean;
  maxIterations: number;
  onlyTester?: string;
  againstRef?: string;
  concurrency: number;
  noServe: boolean;
  autofixBranch?: string;
  maxBudgetUsd?: number;
  dryRun: boolean;
  microsEnabled?: boolean;
  contractHash?: string;
}

export interface OrchestratorResult {
  auditRunDir: string;
  auditRunId: string;
  findingsCount: number;
  bySeverity: { critical: number; major: number; minor: number };
  biomesAffected: string[];
  testersRun: number;
  testersFailed: number;
  exitCode: 0 | 1 | 2 | 3;
  regressions?: number; // Only set when --against is used
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a filesystem-safe ISO timestamp for the audit run directory.
 * Format: YYYY-MM-DDTHH-mm-ss-mmmZ (colons replaced with dashes)
 * Per NUTRIENTS.md §2.
 */
function createFsSafeTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, `-${String(now.getMilliseconds()).padStart(3, "0")}Z`);
}

/**
 * Generate an audit run ID: <iso-timestamp>-<4-char-hash>
 * Per NUTRIENTS.md §2 (summary.json shape).
 */
function createAuditRunId(timestamp: string): string {
  const hash = crypto.createHash("sha256").update(timestamp + process.pid).digest("hex").slice(0, 4);
  return `${timestamp}-${hash}`;
}

/**
 * Load baseline findings from a path or git ref.
 * Returns array of Finding objects, or null if baseline not found/readable.
 */
function loadBaselineFindings(ref: string, cultivationDir: string): Finding[] | null {
  // First try: treat ref as a direct path to findings.jsonl
  let findingsPath = ref;
  if (!path.isAbsolute(ref)) {
    findingsPath = path.join(cultivationDir, ref);
  }

  if (fs.existsSync(findingsPath) && findingsPath.endsWith(".jsonl")) {
    return parseFindingsJsonl(findingsPath);
  }

  // Second try: treat ref as audit/<timestamp> directory
  const asDir = path.join(cultivationDir, "audit", ref, "findings.jsonl");
  if (fs.existsSync(asDir)) {
    return parseFindingsJsonl(asDir);
  }

  // Third try: if ref looks like a git ref, we'd need to git show
  // For now, return null — git ref support is a stretch goal for Phase 2.
  // TODO: Support git refs via `git show <ref>:audit/<latest>/findings.jsonl`
  return null;
}

/**
 * Parse a findings.jsonl file into an array of Finding objects.
 */
function parseFindingsJsonl(filePath: string): Finding[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());
  return lines.map((line) => JSON.parse(line) as Finding);
}

/**
 * Compute regression diff between baseline and new findings.
 * Returns { unchanged, regressions, fixed } ID sets.
 */
function diffFindings(
  baseline: Finding[],
  current: Finding[]
): { unchanged: Set<string>; regressions: Set<string>; fixed: Set<string> } {
  const baselineIds = new Set(baseline.map((f) => f.id));
  const currentIds = new Set(current.map((f) => f.id));

  const unchanged = new Set<string>();
  const regressions = new Set<string>();
  const fixed = new Set<string>();

  for (const id of currentIds) {
    if (baselineIds.has(id)) {
      unchanged.add(id);
    } else {
      regressions.add(id);
    }
  }

  for (const id of baselineIds) {
    if (!currentIds.has(id)) {
      fixed.add(id);
    }
  }

  return { unchanged, regressions, fixed };
}

/**
 * Collect all findings from tester results.
 */
function collectFindings(results: TesterResult[]): Finding[] {
  const findings: Finding[] = [];
  for (const result of results) {
    if (result.finding) {
      findings.push(result.finding);
    }
  }
  return findings;
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Main orchestration pipeline for `mycelium audit-run`.
 * Wires: loadTesters → runTestersInPool → aggregate → composeBriefFix → writeSummary.
 *
 * @param opts - Options from CLI flags
 * @returns OrchestratorResult with exit code and summary data
 */
export async function runAuditOrchestrator(
  opts: OrchestratorOptions
): Promise<OrchestratorResult> {
  const { cultivationDir, concurrency, dryRun, noServe, onlyTester, againstRef } = opts;

  // ── Step 1: Create audit run directory ──────────────────────────────────
  const timestamp = createFsSafeTimestamp();
  const auditRunId = createAuditRunId(timestamp);
  const auditRunDir = path.join(cultivationDir, "audit", timestamp);

  if (!dryRun) {
    fs.mkdirSync(auditRunDir, { recursive: true });
    fs.mkdirSync(path.join(auditRunDir, "testers"), { recursive: true });
  }

  // ── Step 2: Load testers ────────────────────────────────────────────────
  let testers: TesterDef[];
  try {
    testers = loadTesters(cultivationDir);
  } catch (err) {
    console.error(`[audit-run] Failed to load testers: ${(err as Error).message}`);
    return {
      auditRunDir,
      auditRunId,
      findingsCount: 0,
      bySeverity: { critical: 0, major: 0, minor: 0 },
      biomesAffected: [],
      testersRun: 0,
      testersFailed: 1, // loader error counts as tester error
      exitCode: 3,
    };
  }

  if (testers.length === 0 && !onlyTester) {
    console.error(
      "[audit-run] No testers found. Create hyphae/HYPHA-TEST-*.md files or use scaffold-tester."
    );
    return {
      auditRunDir,
      auditRunId,
      findingsCount: 0,
      bySeverity: { critical: 0, major: 0, minor: 0 },
      biomesAffected: [],
      testersRun: 0,
      testersFailed: 0,
      exitCode: 0, // No testers = clean (no findings)
    };
  }

  // ── Step 3: Filter testers if --only-tester ─────────────────────────────
  if (onlyTester) {
    testers = filterTesters(testers, { onlyTesterId: onlyTester });
    if (testers.length === 0) {
      console.error(`[audit-run] Tester '${onlyTester}' not found.`);
      return {
        auditRunDir,
        auditRunId,
        findingsCount: 0,
        bySeverity: { critical: 0, major: 0, minor: 0 },
        biomesAffected: [],
        testersRun: 0,
        testersFailed: 1,
        exitCode: 3,
      };
    }
  }

  // ── Dry-run: print execution plan and exit ──────────────────────────────
  if (dryRun) {
    console.log("\n[audit-run] DRY RUN — execution plan:\n");
    console.log(`  Audit run ID:    ${auditRunId}`);
    console.log(`  Output dir:      ${auditRunDir}`);
    console.log(`  Concurrency:     ${concurrency}`);
    console.log(`  Testers to run:  ${testers.length}`);
    console.log("");
    for (const tester of testers) {
      console.log(`    - ${tester.id} (mirrors: ${tester.mirrors_biome || "cross-cutting"})`);
    }
    console.log("");
    console.log("  No sessions spawned. Exiting 0.\n");
    return {
      auditRunDir,
      auditRunId,
      findingsCount: 0,
      bySeverity: { critical: 0, major: 0, minor: 0 },
      biomesAffected: [],
      testersRun: 0,
      testersFailed: 0,
      exitCode: 0,
    };
  }

  // ── Step 4: Write initial sporenet audit block ──────────────────────────
  if (!noServe) {
    const sporenetDir = path.join(cultivationDir, "sporenet");
    if (fs.existsSync(sporenetDir)) {
      writeAuditBlock(sporenetDir, {
        status: "running",
        audit_run_id: auditRunId,
        iteration: 0,
        findings_count: 0,
        by_severity: { critical: 0, major: 0, minor: 0 },
        biomes_affected: [],
        last_run_at: null,
        started_at: new Date().toISOString(),
      });
    }
  }

  // ── Step 5: Run testers in pool ─────────────────────────────────────────
  console.log(`\n[audit-run] Running ${testers.length} testers (concurrency: ${concurrency})...\n`);

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const results = await runTestersInPool(testers, {
    auditRunDir,
    cultivationDir,
    iteration: 0,
    concurrency,
    microsEnabled: opts.microsEnabled,
    contractHash: opts.contractHash,
  });

  const endedAt = new Date().toISOString();
  const wallMs = Date.now() - startMs;

  // ── Step 6: Collect findings and count errors ───────────────────────────
  const findings = collectFindings(results);
  const testersFailed = results.filter((r) => r.exit_code !== 0 && !r.finding).length;

  // ── Step 7: Aggregate findings ──────────────────────────────────────────
  const aggregated = aggregate(findings);

  const bySeverity = {
    critical: aggregated.criticalBiomes.length > 0 ? findings.filter((f) => f.severity === "critical").length : 0,
    major: findings.filter((f) => f.severity === "major").length,
    minor: findings.filter((f) => f.severity === "minor").length,
  };

  // Recount criticals properly
  bySeverity.critical = findings.filter((f) => f.severity === "critical").length;

  const biomesAffected = [
    ...new Set([...aggregated.criticalBiomes, ...aggregated.majorBiomes]),
  ];

  // ── Step 8: Handle --against baseline diff ──────────────────────────────
  let regressions: number | undefined;
  let baselinePath: string | null = null;

  if (againstRef) {
    const baseline = loadBaselineFindings(againstRef, cultivationDir);
    if (baseline) {
      baselinePath = againstRef;
      const diff = diffFindings(baseline, findings);
      regressions = diff.regressions.size;

      console.log(`\n[audit-run] Baseline diff (--against ${againstRef}):`);
      console.log(`  Unchanged: ${diff.unchanged.size}`);
      console.log(`  Regressions (new): ${diff.regressions.size}`);
      console.log(`  Fixed: ${diff.fixed.size}`);
    } else {
      console.warn(`[audit-run] Warning: Could not load baseline from '${againstRef}'`);
    }
  }

  // ── Step 9: Read original brief.md if present ───────────────────────────
  const briefPath = path.join(cultivationDir, "brief.md");
  const originalBrief = fs.existsSync(briefPath)
    ? fs.readFileSync(briefPath, "utf-8")
    : "";

  // ── Step 10: Compose brief-fix.md ───────────────────────────────────────
  const briefFixContent = composeBriefFix(originalBrief, aggregated, baselinePath);
  const briefFixPath = path.join(auditRunDir, "brief-fix.md");
  fs.writeFileSync(briefFixPath, briefFixContent, "utf-8");

  // ── Step 11: Write summary.json ─────────────────────────────────────────
  // Bug 4 fix (2026-05-11): writeSummary is async; without await the orchestrator
  // returns before the temp/rename completes and the process exits with no
  // summary.json on disk. Affected only the non-autofix path because autofix's
  // heal-loop kept the event loop alive long enough for the dangling write.
  const organism = readOrganismName(cultivationDir);

  await writeSummary(auditRunDir, {
    audit_run_id: auditRunId,
    organism,
    started_at: startedAt,
    ended_at: endedAt,
    wall_ms: wallMs,
    testers_run: testers.length,
    testers_failed: testersFailed,
    findings_count: findings.length,
    by_severity: bySeverity,
    biomes_affected: biomesAffected,
    iteration: 0,
    audit_baseline: baselinePath ?? undefined,
  });

  // ── Step 12: Update sporenet audit block (complete) ─────────────────────
  if (!noServe) {
    const sporenetDir = path.join(cultivationDir, "sporenet");
    if (fs.existsSync(sporenetDir)) {
      writeAuditBlock(sporenetDir, {
        status: testersFailed > 0 ? "failed" : "complete",
        audit_run_id: auditRunId,
        iteration: 0,
        findings_count: findings.length,
        by_severity: bySeverity,
        biomes_affected: biomesAffected,
        last_run_at: endedAt,
        started_at: null, // No longer running
      });
      await drainAuditStateWrites();
    }
  }

  // ── Step 13: Handle --autofix (Phase 2) ──────────────────────────────────
  // When --autofix is set, hand off to runHealLoop which iterates:
  //   re-plant affected biomes → re-run testers → repeat until clean or capped.
  // The heal-loop returns the final exit code.
  if (opts.autofix && bySeverity.critical > 0) {
    console.log(`\n[audit-run] --autofix: Entering heal loop (max ${opts.maxIterations} iterations)...`);

    // runTestersFn signature per heal-loop.ts: (auditRunDir, cultivationDir, iteration) => Promise<Finding[]>
    const runTestersFn = async (iterRunDir: string, iterCultDir: string, iteration: number) => {
      const results = await runTestersInPool(testers, {
        auditRunDir: iterRunDir,
        cultivationDir: iterCultDir,
        iteration,
        concurrency,
        microsEnabled: opts.microsEnabled,
        contractHash: opts.contractHash,
      });
      return collectFindings(results);
    };

    const healResult = await runHealLoop(
      {
        auditRunDir,
        cultivationDir,
        maxIterations: opts.maxIterations,
        maxBudgetUsd: opts.maxBudgetUsd ?? Infinity,
        autofixBranch: opts.autofixBranch,
        concurrency,
        originalBriefPath: path.join(cultivationDir, "brief.md"),
      },
      runTestersFn
    );

    // Derive final counts from HealLoopResult
    const finalBySeverity = {
      critical: healResult.finalFindings.filter((f) => f.severity === "critical").length,
      major: healResult.finalFindings.filter((f) => f.severity === "major").length,
      minor: healResult.finalFindings.filter((f) => f.severity === "minor").length,
    };
    const finalBiomesAffected = [
      ...healResult.finalAggregated.criticalBiomes,
      ...healResult.finalAggregated.majorBiomes,
    ];

    // Exit code: 0 if success (zero criticals), 2 if exhausted with criticals remaining
    const healExitCode: 0 | 1 | 2 | 3 = healResult.success ? 0 : 2;

    return {
      auditRunDir,
      auditRunId,
      findingsCount: healResult.finalFindings.length,
      bySeverity: finalBySeverity,
      biomesAffected: finalBiomesAffected,
      testersRun: testers.length,
      testersFailed: 0, // Heal-loop handles tester errors internally
      exitCode: healExitCode,
      regressions,
    };
  }

  // ── Step 14: Determine exit code (non-autofix path) ─────────────────────
  // Exit codes per NUTRIENTS §7:
  //   0: no findings (or autofix succeeded — zero criticals at termination)
  //   1: findings present in non-autofix mode
  //   2: autofix exhausted with criticals remaining (handled by heal-loop)
  //   3: tester_error count > 0 (operator concern)
  let exitCode: 0 | 1 | 2 | 3;
  if (testersFailed > 0) {
    exitCode = 3;
  } else if (findings.length > 0) {
    exitCode = 1;
  } else {
    exitCode = 0;
  }

  // ── Summary output ──────────────────────────────────────────────────────
  console.log(`\n[audit-run] Complete.`);
  console.log(`  Audit run ID:    ${auditRunId}`);
  console.log(`  Testers run:     ${testers.length}`);
  console.log(`  Testers failed:  ${testersFailed}`);
  console.log(`  Findings:        ${findings.length}`);
  console.log(`    Critical:      ${bySeverity.critical}`);
  console.log(`    Major:         ${bySeverity.major}`);
  console.log(`    Minor:         ${bySeverity.minor}`);
  console.log(`  Biomes affected: ${biomesAffected.length > 0 ? biomesAffected.join(", ") : "(none)"}`);
  console.log(`  Wall time:       ${(wallMs / 1000).toFixed(2)}s`);
  console.log(`  Output:          ${auditRunDir}`);
  if (regressions !== undefined) {
    console.log(`  Regressions:     ${regressions}`);
  }
  console.log(`  Exit code:       ${exitCode}\n`);

  return {
    auditRunDir,
    auditRunId,
    findingsCount: findings.length,
    bySeverity,
    biomesAffected,
    testersRun: testers.length,
    testersFailed,
    exitCode,
    regressions,
  };
}

/**
 * Read organism name from mycelium.yaml.
 */
function readOrganismName(cultivationDir: string): string {
  const yamlPath = path.join(cultivationDir, "mycelium.yaml");
  if (!fs.existsSync(yamlPath)) {
    return "unknown";
  }
  try {
    const content = fs.readFileSync(yamlPath, "utf-8");
    // Simple regex extraction — avoid adding yaml parser dependency
    const match = content.match(/^\s*name:\s*(.+)$/m);
    return match ? match[1].trim() : "unknown";
  } catch {
    return "unknown";
  }
}

// ── Re-exports for convenience ──────────────────────────────────────────────
export type { TesterDef, TesterResult, Finding };
