// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium cultivate` — bring the organism to life.
//
// Cellular execution: each biome orchestrates a petri dish. `cultivate`
// walks the tree (biome → specialist → leaf), extracts every leaf, and
// spawns one Claude Agent SDK session per leaf in parallel. Gating is
// either wave-based (blocked_by → fruit completion) or contract-freeze
// (all leaves start once NUTRIENTS.md is frozen) depending on
// `organism.gating`.

import { Command } from "commander";
import chalk from "chalk";
import ora, { Ora } from "ora";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Upgrade, UpgradeCtx } from "../lib/upgrades/types.js";
import { resolveUpgrades } from "../upgrades/registry.js";
import { readMaxBudgetUsd } from "../lib/budget.js";
import { runWithConcurrency } from "../lib/concurrency.js";
import {
  runBeforePlan,
  runBeforeSpawn,
  runTransformPrompt,
  runAfterLeaf,
  runOnCrash,
} from "../lib/upgrades/hooks.js";

interface SubAgent {
  id: string;
  scope: string;
  capabilities?: string[];
  needs_contracts?: string[];
  sub_agents?: SubAgent[];
}

interface Agent {
  id: string;
  scope: string;
  branch: string;
  blocked_by: string[];
  blocks: string[];
  capabilities: string[];
  sub_agents?: SubAgent[];
}

interface Leaf {
  id: string;
  scope: string;
  branch: string;
  /** biome → ... → leaf */
  lineage: string[];
  biome: string;
}

interface LeafResult {
  leaf: Leaf;
  success: boolean;
  artifacts: string[];
  error?: string;
  ms: number;
  logPath?: string;
}

export function registerCultivateCommand(program: Command): void {
  program
    .command("cultivate")
    .description("🌍 Start the full organism — bring the mycelium to life")
    .option("--dry-run", "Print the execution plan without spawning sessions", false)
    .option(
      "-c, --max-concurrency <n>",
      "Max simultaneous leaf sessions (default: 50)",
      (v) => parseInt(v, 10),
      50
    )
    .option(
      "--only-biome <id>",
      "Cultivate only one biome's dish (for targeted re-runs)"
    )
    .option(
      "--exclude-biome <ids...>",
      "Skip these biomes (space-separated) — use for held-back work"
    )
    .option(
      "--no-push",
      "Auto-commit but do not push to origin (default: push)"
    )
    .action(async (opts) => {
      const configPath = path.join(process.cwd(), "mycelium.yaml");
      if (!fs.existsSync(configPath)) {
        console.log(
          chalk.red("  ❌ No mycelium.yaml found. Run ") +
            chalk.cyan("mycelium init") +
            chalk.red(" or ") +
            chalk.cyan("mycelium plant") +
            chalk.red(" first.")
        );
        return;
      }

      const config = YAML.parse(fs.readFileSync(configPath, "utf-8"));
      config._push = opts.push !== false;
      const organism = config.organism || { name: "unknown" };
      const agents: Agent[] = config.agents || [];
      const gating: string = organism.gating || "wave";
      const cellular: boolean = organism.cellular === true;

      if (agents.length === 0) {
        console.log(
          chalk.yellow("  🌑 No agents to cultivate. Create some first with ") +
            chalk.cyan("mycelium agent create <name>")
        );
        return;
      }

      banner(organism, agents, gating, cellular, opts);

      // ── Flatten the tree to leaves ─────────────────────────────────
      let biomes = opts.onlyBiome
        ? agents.filter((a) => a.id === opts.onlyBiome)
        : agents;

      if (opts.onlyBiome && biomes.length === 0) {
        console.log(chalk.red(`  ❌ Biome "${opts.onlyBiome}" not found.`));
        return;
      }

      const excluded: string[] = Array.isArray(opts.excludeBiome)
        ? opts.excludeBiome
        : opts.excludeBiome
        ? [opts.excludeBiome]
        : [];
      if (excluded.length > 0) {
        const before = biomes.length;
        biomes = biomes.filter((a) => !excluded.includes(a.id));
        console.log(
          chalk.yellow(
            `  🚫 Excluded ${before - biomes.length} biome(s): ${excluded.join(", ")}`
          )
        );
      }

      let leaves: Leaf[] = biomes.flatMap((biome) => flattenBiome(biome));

      // ── F3: ensure sporenet/state.json exists so per-leaf writes during
      // cultivate land on disk. Without this, writeLeafState silently no-ops
      // when cultivate runs through `mycelium ddp` (which doesn't include a
      // sporenet init step in its pipeline).
      ensureSporenetState(
        process.cwd(),
        leaves.map((l) => ({ id: l.id, biome: l.biome, scope: l.scope })),
        organism
      );

      // ── F1: skip leaves already marked done in sporenet/state.json ──
      const doneIds = loadDoneLeafIds(process.cwd());
      if (doneIds.size > 0) {
        const before = leaves.length;
        leaves = leaves.filter((l) => !doneIds.has(l.id));
        const skipped = before - leaves.length;
        if (skipped > 0) {
          console.log(
            chalk.gray(
              `  ⏭  Skipping ${skipped} already-done leaf(s) per sporenet/state.json`
            )
          );
        }
      }

      // ── Resolve installed upgrades ─────────────────────────────────
      const upgradeNames: string[] = organism.upgrades ?? [];
      let upgrades: Upgrade[] = [];
      try {
        upgrades = resolveUpgrades(upgradeNames);
      } catch (err: any) {
        console.log(chalk.red(`  ❌ ${err.message}`));
        return;
      }

      const upgradeCtx: UpgradeCtx = {
        organism,
        agents,
        leaves,
        config,
        targetDir: process.cwd(),
        runLogDir: "",
      };

      if (upgrades.length > 0) {
        console.log();
        console.log(
          chalk.magentaBright("  🔧 Upgrades: ") +
            chalk.cyan(upgrades.map((u) => u.manifest.name).join(", "))
        );
        const outcome = await runBeforePlan(upgrades, upgradeCtx);
        for (const w of outcome.warnings) {
          console.log(chalk.yellow(`  ⚠ ${w}`));
        }
        if (outcome.abort) {
          console.log();
          for (const r of outcome.reasons) {
            console.log(chalk.red(`  ❌ ${r}`));
          }
          console.log();
          return;
        }
      }

      // B18: duplicate leaf ids collide on feat/<id> branches, worktree
      // paths, and state.json keys — reject loudly instead of corrupting
      // all three downstream. --dry-run is the designated validation
      // discipline, so this must fire there too (it does: same path).
      const seenIds = new Map<string, number>();
      for (const l of leaves) seenIds.set(l.id, (seenIds.get(l.id) ?? 0) + 1);
      const dupes = [...seenIds.entries()].filter(([, n]) => n > 1).map(([id]) => id);
      if (dupes.length > 0) {
        console.log(
          chalk.red.bold(`  ❌ Duplicate leaf id(s) in mycelium.yaml: `) +
            chalk.yellow(dupes.join(", "))
        );
        console.log(
          chalk.gray("     Each leaf id must be unique — ids key feat/<id> branches, worktrees, and sporenet state.")
        );
        process.exitCode = 1;
        return;
      }

      const waves: Leaf[][] = gating === "contract-freeze"
        ? [leaves] // one wave, all at once
        : buildLeafWaves(biomes, leaves);

      // ── Execution plan ─────────────────────────────────────────────
      console.log();
      console.log(chalk.magentaBright("  🧬 Execution plan\n"));
      console.log(
        chalk.gray("    Biomes:      ") + chalk.white(String(biomes.length))
      );
      console.log(
        chalk.gray("    Leaf agents: ") + chalk.white(String(leaves.length))
      );
      console.log(
        chalk.gray("    Waves:       ") + chalk.white(String(waves.length))
      );
      console.log(
        chalk.gray("    Concurrency: ") +
          chalk.white(String(opts.maxConcurrency))
      );
      console.log(
        chalk.gray("    Gating:      ") + chalk.cyan(gating)
      );
      console.log();

      for (let i = 0; i < waves.length; i++) {
        console.log(chalk.gray(`    Wave ${i + 1} (${waves[i].length}):`));
        for (const leaf of waves[i]) {
          console.log(
            chalk.gray("      • ") +
              chalk.cyan(leaf.id) +
              chalk.gray(" — ") +
              chalk.white(leaf.scope)
          );
        }
      }
      console.log();

      if (opts.dryRun) {
        console.log(
          chalk.yellow.bold("  ⚠️  DRY RUN — no sessions spawned.\n")
        );
        return;
      }

      // ── Cultivation: spawn each wave with a concurrency limit ─────
      installShutdownHook();
      console.log(chalk.magentaBright("  🌱 Cultivating...\n"));

      const targetDir = process.cwd();
      const logsDir = path.join(targetDir, "logs");
      fs.mkdirSync(logsDir, { recursive: true });
      const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
      const runLogDir = path.join(logsDir, runStamp);
      fs.mkdirSync(runLogDir, { recursive: true });
      upgradeCtx.runLogDir = runLogDir;
      console.log(chalk.gray(`  📝 Leaf logs: ${path.relative(targetDir, runLogDir)}/<leaf-id>.log\n`));
      const allResults: LeafResult[] = [];

      // 0.1: resolve the BASE commit every leaf worktree forks from. null →
      // not a git repo → cultivateLeaf falls back to the legacy shared tree.
      // B13: `let`, not `const` — re-resolved after each wave's integration
      // so later waves fork from a BASE that includes earlier waves' output.
      let base = resolveBase(targetDir);
      if (base) {
        console.log(chalk.gray(`  🌲 Worktree isolation: leaves fork from ${base.slice(0, 8)}\n`));
      } else {
        console.log(chalk.yellow(`  ⚠ Not a git repo — leaves share the working tree (no isolation)\n`));
      }
      const allConflicts: { leafId: string; files: string[] }[] = [];

      try {
        for (let w = 0; w < waves.length; w++) {
          const wave = waves[w];
          console.log(
            chalk.gray(`  ── Wave ${w + 1}/${waves.length} `) +
              chalk.gray("─".repeat(40))
          );

          const results = await runWithConcurrency(
            wave,
            opts.maxConcurrency,
            async (leaf) => {
              if (upgrades.length > 0) {
                const dec = await runBeforeSpawn(upgrades, upgradeCtx, leaf);
                if (dec.skip) {
                  console.log(
                    chalk.cyan(`  ⏭ ${leaf.id}`) +
                      chalk.gray(` — skipped: ${dec.skipReason ?? "upgrade"}`)
                  );
                  const synthetic: LeafResult = {
                    leaf,
                    success: true,
                    artifacts: [],
                    ms: 0,
                  };
                  await runAfterLeaf(upgrades, upgradeCtx, leaf, synthetic);
                  return synthetic;
                }
              }
              const result = await cultivateLeaf(
                leaf,
                targetDir,
                config,
                runLogDir,
                upgrades,
                upgradeCtx,
                base
              );
              if (upgrades.length > 0) {
                await runAfterLeaf(upgrades, upgradeCtx, leaf, result);
              }
              return result;
            }
          );
          allResults.push(...results);

          // 0.1: integrate this wave's leaf branches onto the working tree,
          // single-threaded, in the main loop. Disjoint changes merge clean;
          // same-path overlaps CONFLICT loudly (attributed to the leaf) rather
          // than silently last-writer-wins. Only runs in worktree (git) mode.
          if (base) {
            const wonLeaves = results
              .filter((r) => r.success)
              .map((r) => r.leaf);
            const integ = await integrateLeafBranches(targetDir, wonLeaves);
            if (integ.merged.length > 0) {
              console.log(
                chalk.gray(`  🔗 Integrated ${integ.merged.length} leaf branch(es) into the working tree`)
              );
            }
            for (const c of integ.conflicted) {
              allConflicts.push(c);
              // B15: the leaf already wrote status=done at completion time,
              // BEFORE integration ran. Flip it so ddp/harvest/dashboard see
              // unmerged work as not shipped (additive fields per rule #9).
              writeLeafState(targetDir, c.leafId, {
                status: "conflicted",
                integrated: false,
                conflict_files: c.files,
              });
              console.log(
                chalk.red(`  ✗ MERGE CONFLICT — leaf ${chalk.bold(c.leafId)} overlaps existing work`) +
                  (c.files.length ? chalk.yellow(`\n      colliding: ${c.files.join(", ")}`) : "")
              );
            }
            // B13: waves after this one must fork from the post-integration
            // HEAD, not the run-start BASE — otherwise wave-N leaves cannot
            // see files that waves 1..N-1 created (Edits hit missing files,
            // then merge-conflict on integration).
            if (integ.merged.length > 0) {
              base = resolveBase(targetDir) ?? base;
            }
          }
          console.log();
        }
      } catch (err) {
        if (upgrades.length > 0) {
          await runOnCrash(upgrades, upgradeCtx, err);
        }
        throw err;
      }

      // ── F3: drain queued sporenet/state.json writes before exit ────
      // Each writeLeafState call enqueues onto a serialized promise chain
      // (see helper). Without an explicit drain, the process can return
      // before the final status=done writes hit disk, leaving harvest +
      // dashboard with a stale view.
      await drainLeafStateWrites();

      // ── 0.1: push integrated leaf branches (deferred from per-leaf) ──
      // In worktree mode push was suppressed at commit time; now that every
      // branch is created + integrated, push them from the main tree if the
      // organism wants a remote. Best-effort, swallow no-remote.
      if (base && (config as any)._push !== false) {
        const wonIds = allResults.filter((r) => r.success).map((r) => r.leaf.id);
        let pushed = 0;
        for (const id of wonIds) {
          const branch = `feat/${id}`;
          try {
            git(targetDir, ["rev-parse", "--verify", branch]);
          } catch {
            continue; // branch never created (no-op leaf)
          }
          try {
            git(targetDir, ["push", "--set-upstream", "origin", branch]);
            pushed++;
          } catch {
            // no remote / push failure — non-fatal, mirrors legacy behavior
          }
        }
        if (pushed > 0) {
          console.log(chalk.gray(`  ⬆ Pushed ${pushed} leaf branch(es) to origin`));
        }
      }

      // ── 0.1: loud integration-conflict summary ──────────────────────
      // Surfaces the overlaps that the old shared-tree mechanism would have
      // lost silently (last-writer-wins). A conflict means two leaves'
      // declared scopes physically overlapped — a decomposition bug to fix,
      // not a silent data loss to discover later.
      if (allConflicts.length > 0) {
        console.log();
        console.log(
          chalk.red.bold(`  ⚠️  ${allConflicts.length} leaf branch(es) did NOT integrate (scope overlap):`)
        );
        for (const c of allConflicts) {
          console.log(
            chalk.red(`     • ${c.leafId}`) +
              (c.files.length ? chalk.yellow(` — ${c.files.join(", ")}`) : "")
          );
        }
        console.log(
          chalk.gray(`     Their feat/<id> branches exist but are unmerged; resolve manually or fix the overlapping scopes.`)
        );
        console.log();
        // B15: unmerged work means the cultivation did NOT fully ship — let
        // ddp (which halts on non-zero exit) and CI see that. exitCode, not
        // process.exit(), so the report below still prints and streams flush.
        process.exitCode = 1;
      }

      // ── Report ─────────────────────────────────────────────────────
      summary(allResults, organism);
    });
}

// ── Session lifecycle ──────────────────────────────────────────────────
// Every live Claude Agent SDK Query goes in this set so we can cleanly
// interrupt + release all of them on error or ctrl-c.

const activeSessions = new Set<any>();

// B17: live worktrees registered here so the shutdown hook can tear them
// down — per-leaf `finally` blocks never run on SIGINT/SIGTERM, which left
// stale worktrees, orphan refs, and state.json stuck `active`.
const activeWorktrees = new Map<string, { targetDir: string; wtPath: string }>();

async function closeStream(s: any): Promise<void> {
  try {
    if (typeof s?.interrupt === "function") {
      await s.interrupt().catch(() => undefined);
    }
    if (typeof s?.return === "function") {
      await s.return(undefined).catch(() => undefined);
    }
  } catch {
    // best-effort cleanup only
  }
}

let sigintInstalled = false;
function installShutdownHook(): void {
  if (sigintInstalled) return;
  sigintInstalled = true;
  const shutdown = async () => {
    const count = activeSessions.size;
    if (count > 0) {
      console.log();
      console.log(chalk.yellow.bold(`  ✋ Interrupt received — closing ${count} active session(s)...`));
      const pending = Array.from(activeSessions);
      activeSessions.clear();
      await Promise.allSettled(pending.map((s) => closeStream(s)));
      console.log(chalk.yellow("  🍂 Sessions closed."));
    }
    // B17: best-effort worktree teardown — the per-leaf `finally` blocks
    // won't run after process.exit. Direct git calls (not commitQueue —
    // the queue may hold ops that will never complete now).
    if (activeWorktrees.size > 0) {
      console.log(chalk.yellow(`  🧹 Removing ${activeWorktrees.size} leaf worktree(s)...`));
      for (const { targetDir, wtPath } of activeWorktrees.values()) {
        try {
          git(targetDir, ["worktree", "remove", "--force", wtPath]);
        } catch {}
        try {
          fs.rmSync(wtPath, { recursive: true, force: true });
        } catch {}
        try {
          git(targetDir, ["worktree", "prune"]);
        } catch {}
      }
      activeWorktrees.clear();
    }
    // B17: flush queued sporenet/state.json writes so leaves interrupted
    // mid-flight don't leave the dashboard showing a stale `active`.
    try {
      await drainLeafStateWrites();
    } catch {}
    console.log(chalk.yellow("  Exiting."));
    process.exit(130);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

// ── Tree flattening ────────────────────────────────────────────────────

function flattenBiome(biome: Agent): Leaf[] {
  const out: Leaf[] = [];
  const walk = (specs: SubAgent[] | undefined, lineage: string[]) => {
    if (!specs || specs.length === 0) {
      // biome has no sub_agents — the biome itself is the leaf
      if (lineage.length === 1) {
        out.push({
          id: biome.id,
          scope: biome.scope,
          branch: biome.branch,
          lineage,
          biome: biome.id,
        });
      }
      return;
    }
    for (const s of specs) {
      const nextLineage = [...lineage, s.id];
      if (s.sub_agents && s.sub_agents.length > 0) {
        walk(s.sub_agents, nextLineage);
      } else {
        out.push({
          id: s.id,
          scope: s.scope,
          branch: `feat/${s.id}`,
          lineage: nextLineage,
          biome: biome.id,
        });
      }
    }
  };
  walk(biome.sub_agents, [biome.id]);
  return out;
}

// ── Wave gating (biome-level blocked_by) ───────────────────────────────

function buildLeafWaves(biomes: Agent[], leaves: Leaf[]): Leaf[][] {
  const byBiome: Record<string, Leaf[]> = {};
  for (const l of leaves) {
    (byBiome[l.biome] ||= []).push(l);
  }

  const placed = new Set<string>();
  const waves: Leaf[][] = [];
  let remaining = [...biomes];

  while (remaining.length > 0) {
    const ready = remaining.filter((b) =>
      (b.blocked_by || []).every((dep) => placed.has(dep))
    );
    if (ready.length === 0) {
      // B18: cycle / dead-end — previously dumped silently, so --dry-run
      // (the designated validation discipline) rendered a cyclic plan as
      // if intentional. Still dump into a final wave (fail-soft: the work
      // runs), but say so loudly and name the biomes involved.
      console.log(
        chalk.yellow.bold(
          `  ⚠️  blocked_by cycle or unresolvable dependency among: ` +
            remaining.map((b) => b.id).join(", ")
        )
      );
      console.log(
        chalk.gray(
          "     These biomes' blockers never became ready — running them together in one final wave. Check blocked_by in mycelium.yaml."
        )
      );
      waves.push(remaining.flatMap((b) => byBiome[b.id] || []));
      break;
    }
    const wave: Leaf[] = ready.flatMap((b) => byBiome[b.id] || []);
    if (wave.length > 0) waves.push(wave);
    for (const b of ready) placed.add(b.id);
    remaining = remaining.filter((b) => !placed.has(b.id));
  }

  return waves;
}

// ── The actual SDK spawn per leaf ──────────────────────────────────────

async function cultivateLeaf(
  leaf: Leaf,
  targetDir: string,
  config: any,
  logDir: string,
  upgrades: Upgrade[] = [],
  upgradeCtx?: UpgradeCtx,
  base: string | null = null
): Promise<LeafResult> {
  const started = Date.now();
  const spinner = ora({
    text: chalk.cyan(`🌱 ${leaf.id}`) + chalk.gray(` — ${leaf.scope}`),
    spinner: "dots",
    indent: 2,
  }).start();

  // F3: mark active so the live dashboard reflects in-flight leaves
  // during the multi-hour cultivate phase, not only at completion.
  // SporeNet state + leaf logs ALWAYS live on the main tree (orchestrator
  // state), never inside the leaf's worktree.
  writeLeafState(targetDir, leaf.id, {
    status: "active",
    started_at: new Date().toISOString(),
  });

  // 0.1: each leaf runs in its own worktree off BASE. `runDir` is where the
  // SDK writes + commits; it falls back to the shared targetDir only if this
  // isn't a git repo (base === null) — preserving the legacy path for the
  // `mycelium init` non-git scaffold case.
  let worktree: Worktree | null = null;
  let runDir = targetDir;
  if (base) {
    try {
      worktree = await addLeafWorktree(targetDir, leaf, base);
      runDir = worktree.path;
    } catch (err: any) {
      // Worktree setup failed — fail the leaf loudly rather than silently
      // falling back to the shared tree (which would re-introduce the race).
      spinner.fail(
        chalk.red(`⚠ ${leaf.id}`) +
          chalk.gray(` — worktree setup failed: ${String(err?.message ?? err).split("\n")[0]}`)
      );
      writeLeafState(targetDir, leaf.id, {
        status: "failed",
        error: `worktree setup failed: ${String(err?.message ?? err).split("\n")[0].slice(0, 160)}`,
        completed_at: new Date().toISOString(),
      });
      return { leaf, success: false, artifacts: [], error: "worktree setup failed", ms: Date.now() - started };
    }
  }

  let prompt = buildLeafPrompt(leaf, config);
  if (upgrades.length > 0 && upgradeCtx) {
    prompt = await runTransformPrompt(upgrades, upgradeCtx, leaf, prompt);
  }
  const artifacts: string[] = [];
  // F7: collect all text emitted by the leaf so we can extract the
  // `Synopsis: <one sentence>` trailer and bake it into the commit body
  // (canonical source the dashboard reads back via git log).
  const leafTextChunks: string[] = [];
  const logPath = path.join(logDir, `${leaf.id}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const logLine = (obj: any) => logStream.write(JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n");
  logLine({ event: "start", leaf: leaf.id, scope: leaf.scope, branch: leaf.branch, lineage: leaf.lineage });
  logLine({ event: "prompt", prompt });

  const maxBudgetUsd = readMaxBudgetUsd(config);
  let budgetExceeded: { spent: number } | null = null;

  let stream: any;
  try {
    stream = query({
      prompt,
      options: {
        cwd: runDir,
        allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        permissionMode: "acceptEdits",
        ...(maxBudgetUsd !== undefined ? { maxBudgetUsd } : {}),
      },
    });
    activeSessions.add(stream);

    for await (const msg of stream) {
      logLine({ event: "sdk_msg", msg });
      if (msg.type === "assistant") {
        const blocks = (msg as any).message?.content ?? [];
        for (const b of blocks) {
          if (b.type === "tool_use") {
            const target = summarizeTool(b.name, b.input);
            if (target) {
              spinner.text =
                chalk.cyan(`🌿 ${leaf.id}`) +
                chalk.gray(` → ${b.name} ${target}`);
              if (b.name === "Write" || b.name === "Edit") {
                if (b.input?.file_path) artifacts.push(b.input.file_path);
              }
            }
          } else if (b.type === "text" && typeof b.text === "string") {
            // F7: capture text output to extract Synopsis trailer later
            leafTextChunks.push(b.text);
          }
        }
      } else if (
        msg.type === "result" &&
        (msg as any).subtype === "error_max_budget_usd"
      ) {
        budgetExceeded = { spent: Number((msg as any).total_cost_usd) || 0 };
      }
    }

    if (budgetExceeded) {
      throw new Error(
        `BUDGET_EXCEEDED: $${budgetExceeded.spent.toFixed(4)} > cap $${(maxBudgetUsd ?? 0).toFixed(4)}`
      );
    }

    // ── F7: extract leaf-emitted Synopsis trailer ──────────────
    // Pulled from the leaf's text output (single-line, case-insensitive
    // match of "Synopsis: <text>"). Baked into the commit body below so
    // the commit becomes the canonical record; we also re-read it back
    // post-commit via the SHA to confirm it landed.
    const leafSynopsis = extractSynopsis(leafTextChunks.join("\n"));

    // ── Auto-commit ─────────────────────────────────────────────
    // 0.1: in worktree mode each leaf commits to its OWN worktree on its
    // own branch — no shared-tree race, so no CommitQueue serialization
    // needed here (that's the whole win). Push is deferred to the post-wave
    // integration pass on the main tree, so we force push=false here.
    // Legacy non-git path (worktree === null) keeps the serialized commit.
    let commitResult: AutoCommitResult | null;
    if (worktree) {
      // B14: privateTree=true — stage the whole worktree so Bash-created
      // files survive teardown, not just SDK-tracked Write/Edit artifacts.
      commitResult = autoCommitLeaf(leaf, runDir, artifacts, false, leafSynopsis, true);
    } else {
      commitResult = await commitQueue.enqueue(async () => {
        return autoCommitLeaf(
          leaf,
          targetDir,
          artifacts,
          (config as any)._push !== false,
          leafSynopsis
        );
      });
    }
    const commitMsg = commitResult?.message ?? null;
    const commitSha = commitResult?.sha ?? null;

    // ── Mark done in SporeNet (F2: symmetric with failure path) ─
    const updates: Record<string, any> = {
      status: "done",
      completed_at: new Date().toISOString(),
      // F3: persist duration + file count for the dashboard (F10).
      duration_seconds: Math.round(((Date.now() - started) / 1000) * 10) / 10,
      files_produced: Array.from(new Set(artifacts)).length,
    };
    if (commitSha) {
      updates.commit = commitSha;
    } else {
      const shaMatch = (commitMsg ?? "").match(/\b[0-9a-f]{7,40}\b/);
      if (shaMatch) updates.commit = shaMatch[0];
      else if ((commitMsg ?? "").includes("committed")) {
        try {
          const sha = execFileSync(
            "git",
            ["-C", runDir, "rev-parse", "HEAD"],
            { encoding: "utf-8", maxBuffer: GIT_MAX_BUFFER }
          ).trim();
          updates.commit = sha;
        } catch {}
      }
    }

    // F7: re-extract Synopsis from the commit body using the SHA
    // (race-free vs HEAD; HEAD may already be a sibling leaf's commit
    // by the time we read). Fall back to the in-memory captured value;
    // last-resort fall back to scope so the dashboard always renders.
    let synopsis: string | null = null;
    if (updates.commit) {
      try {
        const body = execFileSync(
          "git",
          ["-C", runDir, "log", "-1", "--format=%B", updates.commit],
          { encoding: "utf-8", maxBuffer: GIT_MAX_BUFFER }
        );
        synopsis = extractSynopsis(body);
      } catch {}
    }
    if (!synopsis) synopsis = leafSynopsis;
    if (!synopsis) {
      console.log(
        chalk.yellow(
          `  ⚠ ${leaf.id}: no Synopsis: trailer in commit body, falling back to scope`
        )
      );
      synopsis = leaf.scope || "";
    }
    updates.synopsis = synopsis;

    writeLeafState(targetDir, leaf.id, updates);

    const ms = Date.now() - started;
    logLine({ event: "fruit_ready", artifacts, ms, commit: commitMsg });
    logStream.end();
    activeSessions.delete(stream);
    await closeStream(stream);
    spinner.succeed(
      chalk.green(`🍄 ${leaf.id}`) +
        chalk.gray(
          ` FRUIT_READY (${artifacts.length} files, ${(ms / 1000).toFixed(1)}s)` +
            (commitMsg ? ` · ${commitMsg}` : "")
        )
    );
    return { leaf, success: true, artifacts, ms, logPath };
  } catch (err: any) {
    const ms = Date.now() - started;
    const errMsg = err?.message ?? String(err);
    logLine({ event: "error", error: errMsg, stack: err?.stack });
    logStream.end();
    if (stream) {
      activeSessions.delete(stream);
      await closeStream(stream);
    }
    // F2: persist failure to SporeNet so re-runs and the dashboard see it
    writeLeafState(targetDir, leaf.id, {
      status: "failed",
      error: errMsg.split("\n")[0].slice(0, 200),
      completed_at: new Date().toISOString(),
    });
    spinner.fail(
      chalk.red(`⚠ ${leaf.id}`) +
        chalk.gray(` failed after ${(ms / 1000).toFixed(1)}s → `) +
        chalk.yellow(path.relative(targetDir, logPath))
    );
    return {
      leaf,
      success: false,
      artifacts,
      error: errMsg,
      ms,
      logPath,
    };
  } finally {
    // 0.1: tear down the leaf's worktree. The commit (and its feat/<id>
    // branch ref) persist in the shared .git after the working-tree files
    // are removed, so integration can still merge the branch afterward.
    if (worktree) {
      await removeLeafWorktree(targetDir, worktree);
    }
  }
}

// F1/F2 helpers — SporeNet state readers/writers ───────────────────────
function loadDoneLeafIds(targetDir: string): Set<string> {
  try {
    const statePath = path.join(targetDir, "sporenet", "state.json");
    if (!fs.existsSync(statePath)) return new Set();
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    return new Set(
      (state.leaves ?? [])
        .filter((l: any) => l.status === "done")
        .map((l: any) => l.id)
    );
  } catch {
    return new Set();
  }
}

// F3: ensure sporenet/state.json exists before cultivate writes to it.
// Without this, writeLeafState silently no-ops when ddp/cultivate runs
// without a prior `mycelium sporenet init` — the dashboard never updates.
// Idempotent: bails if the file already exists.
function ensureSporenetState(
  targetDir: string,
  leaves: Array<{ id: string; biome: string; scope: string }>,
  organism: { name?: string; ship_target?: string; gating?: string }
): void {
  try {
    const sporenetDir = path.join(targetDir, "sporenet");
    const statePath = path.join(sporenetDir, "state.json");
    if (fs.existsSync(statePath)) return;
    fs.mkdirSync(sporenetDir, { recursive: true });
    const sessionId =
      "cultivate-" + new Date().toISOString().replace(/[:.]/g, "-");
    const state = {
      session_id: sessionId,
      organism: organism.name ?? "organism",
      started_at: new Date().toISOString(),
      ...(organism.ship_target ? { ship_target: organism.ship_target } : {}),
      ...(organism.gating ? { gating: organism.gating } : {}),
      total: leaves.length,
      leaves: leaves.map((l) => ({
        id: l.id,
        agent: l.biome,
        tag: l.biome.replace(/-agent$/, "").toUpperCase(),
        scope: l.scope,
        status: "pending" as const,
      })),
    };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch {
    // best-effort; downstream writeLeafState calls will quietly no-op
    // rather than crash cultivate if the seed fails for any reason.
  }
}

// F3: serialize concurrent writeLeafState calls. Multiple leaves cultivate
// in parallel and may both hit writeLeafState (status=active at start,
// status=done at completion) at overlapping times. Without serialization,
// read-modify-write races silently drop one leaf's update. Pair with
// atomic temp-file + rename so the file never appears partially written
// to a concurrent reader (e.g. the live-refresh dashboard polling /).
let _leafStateChain: Promise<void> = Promise.resolve();

function writeLeafState(
  targetDir: string,
  leafId: string,
  updates: Record<string, any>
): void {
  _leafStateChain = _leafStateChain.then(
    () =>
      new Promise<void>((resolve) => {
        try {
          const statePath = path.join(targetDir, "sporenet", "state.json");
          if (!fs.existsSync(statePath)) return resolve();
          const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
          const stateLeaf = state.leaves?.find((l: any) => l.id === leafId);
          if (!stateLeaf) return resolve();
          Object.assign(stateLeaf, updates);
          // Atomic: write to sibling .tmp, rename. Concurrent readers always
          // see a complete state, never a half-truncated mid-write file.
          const tmpPath = statePath + ".tmp";
          fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
          fs.renameSync(tmpPath, statePath);
          resolve();
        } catch {
          resolve(); // best-effort
        }
      })
  );
}

// Wait for queued writeLeafState calls to drain. Call before cultivate
// returns so final-state writes (status=done, completed_at, commit) are
// guaranteed flushed to disk even if the process exits immediately after.
async function drainLeafStateWrites(): Promise<void> {
  await _leafStateChain;
}

function buildLeafPrompt(leaf: Leaf, config: any): string {
  const organism = config.organism?.name ?? "organism";
  const biomeHypha = `hyphae/HYPHA-${leaf.biome.replace(/-agent$/, "").toUpperCase()}-AGENT.md`;

  return [
    `You are the \`${leaf.id}\` specialist sub-agent in the **${organism}** mycelium organism.`,
    ``,
    `Lineage: ${leaf.lineage.join(" → ")}`,
    `Scope:   ${leaf.scope}`,
    `Branch:  ${leaf.branch}`,
    ``,
    `Required reading before you write a line:`,
    `  1. CLAUDE.md            — stack, rules, stream tags`,
    `  2. NUTRIENTS.md         — frozen contracts you must respect`,
    `  3. ${biomeHypha}         — your biome's hypha spec + KPI gates`,
    `  4. mycelium.yaml        — dependency graph + merge order`,
    ``,
    `Your job:`,
    `  - Execute ONLY your scope. Do not drift into sibling leaves.`,
    `  - Respect every frozen contract in NUTRIENTS.md. If a contract does not`,
    `    cover your case, STOP and surface a contract-update request — do not`,
    `    invent new shapes.`,
    `  - Meet the KPI gates in the biome hypha file that apply to your scope.`,
    ``,
    `DO NOT run git yourself. The orchestrator serializes commits across all`,
    `parallel leaves to prevent race conditions. Just write your files and end`,
    `with a final summary line:`,
    ``,
    `  [${leaf.id}] FRUIT_READY — <one-line summary of what you built>`,
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    `REQUIRED — DASHBOARD SYNOPSIS (do not skip, do not drop):`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    `When you finish your final summary line above, you MUST also include a`,
    `Synopsis line for the live launch-demo dashboard. Format exactly:`,
    ``,
    `  Synopsis: <one sentence>`,
    ``,
    `Voice rules — these are non-negotiable:`,
    `  • Active voice, past tense.`,
    `  • Plain English for a non-technical guest at a launch demo.`,
    `  • NO tech terms — banned: state machine, OAuth, RLS, middleware, API,`,
    `    schema, SDK, hook, route, endpoint, migration, JWT, framework.`,
    `  • Describe what a person at the demo would SEE and DO.`,
    ``,
    `Example (good):`,
    `  Synopsis: Built the inbox and message threads where bookings get`,
    `  negotiated and reviewed.`,
    ``,
    `Example (bad — too jargon):`,
    `  Synopsis: Wired Supabase auth middleware with OAuth providers and RLS`,
    `  policies for session management.`,
    ``,
    `The orchestrator will pull this Synopsis line out of your commit body`,
    `and render it on the dashboard. If you skip it, your leaf shows up with`,
    `the raw scope (jargon-walled) at a public demo. Do not skip it.`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    `The network provides. Grow in your lane. 🍄`,
  ].join("\n");
}

// ── Serialized git queue — guards operations on the shared .git ────────
//
// 0.1 (worktree isolation): per-leaf *commits* no longer race — each leaf
// writes + commits inside its OWN worktree on its own `feat/<id>` branch
// off a fixed BASE, so concurrent commits to disjoint worktrees are safe.
// But all worktrees share one `.git`, so worktree add/remove and the
// post-wave integration merge still touch shared ref state. This queue is
// repurposed (NOT removed — hard-rule #2) to serialize exactly those
// shared-ref operations.
class CommitQueue {
  private chain: Promise<any> = Promise.resolve();
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
const commitQueue = new CommitQueue();

// 100MB buffer for git invocations — large leaf outputs can otherwise hit the
// default 1MB cap and fail with ENOBUFS (observed on discovery in run-3).
const GIT_MAX_BUFFER = 100 * 1024 * 1024;

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: GIT_MAX_BUFFER,
  }).toString();
}

// ── 0.1 Worktree isolation ─────────────────────────────────────────────
//
// Each leaf runs in a private `git worktree` checked out at a fixed BASE
// commit. Leaf writes (Write/Edit/Bash — doesn't matter) land ONLY in that
// isolated checkout, so two leaves writing the same path can no longer
// silently clobber each other in a shared tree (the run8 talent-onboarding
// race + the PR#3 "0 files committed" / artifact-overlap follow-ups all
// stem from the shared tree). Cross-leaf coherence is preserved because
// leaves consume frozen NUTRIENTS stubs, never each other's output files
// (verified: buildLeafPrompt requires NUTRIENTS, never sibling artifacts;
// buildLeafWaves uses blocked_by for ORDERING only). Integration happens
// after each wave via a single-threaded merge that surfaces overlaps LOUDLY
// instead of losing them silently.

interface Worktree {
  path: string;
  branch: string;
}

const WORKTREE_ROOT = ".mycelium/worktrees";

// Resolve the BASE commit all leaf worktrees fork from = current HEAD of the
// working branch. Returns null if not a git repo (cultivate then runs in the
// legacy shared-tree mode — see cultivateLeaf).
function resolveBase(targetDir: string): string | null {
  try {
    return git(targetDir, ["rev-parse", "HEAD"]).trim();
  } catch {
    return null;
  }
}

// Add an isolated worktree for a leaf at BASE, on branch feat/<leaf.id>.
// Serialized through commitQueue (shared .git ref state). Force-resets the
// branch + removes any stale worktree dir so re-runs (heal-loop replants)
// are idempotent.
async function addLeafWorktree(
  targetDir: string,
  leaf: Leaf,
  base: string
): Promise<Worktree> {
  const branch = `feat/${leaf.id}`;
  const wtPath = path.join(targetDir, WORKTREE_ROOT, leaf.id);
  await commitQueue.enqueue(async () => {
    // Clean any prior worktree/branch for this leaf (idempotent replant).
    try {
      git(targetDir, ["worktree", "remove", "--force", wtPath]);
    } catch {}
    if (fs.existsSync(wtPath)) {
      fs.rmSync(wtPath, { recursive: true, force: true });
    }
    try {
      git(targetDir, ["worktree", "prune"]);
    } catch {}
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    // -B resets the branch to BASE if it already exists (prior run).
    git(targetDir, ["worktree", "add", "-B", branch, wtPath, base]);
  });
  // B17: register for shutdown-hook teardown (finally blocks don't run on SIGINT).
  activeWorktrees.set(wtPath, { targetDir, wtPath });
  return { path: wtPath, branch };
}

// Remove a leaf's worktree after integration (or on failure). Best-effort;
// serialized. The branch itself is kept until/through integration.
async function removeLeafWorktree(
  targetDir: string,
  wt: Worktree
): Promise<void> {
  activeWorktrees.delete(wt.path); // B17: normal teardown owns it now
  await commitQueue.enqueue(async () => {
    try {
      git(targetDir, ["worktree", "remove", "--force", wt.path]);
    } catch {}
    if (fs.existsSync(wt.path)) {
      fs.rmSync(wt.path, { recursive: true, force: true });
    }
    try {
      git(targetDir, ["worktree", "prune"]);
    } catch {}
  });
}

interface IntegrationResult {
  merged: string[];
  conflicted: { leafId: string; files: string[] }[];
}

// Single-threaded merge of each successful leaf's feat/<id> branch onto the
// working branch in the MAIN tree. Disjoint leaf changes merge cleanly; two
// leaves that touched the same path now CONFLICT explicitly — we abort that
// leaf's merge, name it + the colliding files, and continue. This is the
// whole point of 0.1: silent last-writer-wins becomes a loud, attributable
// integration error. Runs in the main loop (no SDK, no hook).
async function integrateLeafBranches(
  targetDir: string,
  leaves: Leaf[]
): Promise<IntegrationResult> {
  const merged: string[] = [];
  const conflicted: { leafId: string; files: string[] }[] = [];
  for (const leaf of leaves) {
    const branch = `feat/${leaf.id}`;
    // Skip leaves whose branch has no commit beyond BASE (no-op leaf).
    let ahead = "0";
    try {
      ahead = git(targetDir, [
        "rev-list",
        "--count",
        `HEAD..${branch}`,
      ]).trim();
    } catch {
      continue; // branch doesn't exist — nothing to integrate
    }
    if (ahead === "0") continue;
    try {
      git(targetDir, [
        "merge",
        "--no-ff",
        "-m",
        `MERGE ${leaf.id}: integrate leaf branch`,
        branch,
      ]);
      merged.push(leaf.id);
    } catch {
      // Conflict (or other merge failure) — capture the colliding files,
      // then abort so the working tree stays clean for the next leaf.
      let files: string[] = [];
      try {
        files = git(targetDir, ["diff", "--name-only", "--diff-filter=U"])
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      } catch {}
      try {
        git(targetDir, ["merge", "--abort"]);
      } catch {}
      conflicted.push({ leafId: leaf.id, files });
    }
  }
  return { merged, conflicted };
}

interface AutoCommitResult {
  message: string;
  sha: string | null;
}

// F7: extract a single-line `Synopsis: <text>` trailer from arbitrary
// text (leaf assistant output OR a git commit body). Case-insensitive;
// trims trailing whitespace; returns null if no match.
function extractSynopsis(text: string): string | null {
  if (!text) return null;
  const m = text.match(/^[\t ]*synopsis:[\t ]*(.+?)[\t ]*$/im);
  if (!m) return null;
  const v = m[1].trim();
  return v.length > 0 ? v : null;
}

function autoCommitLeaf(
  leaf: Leaf,
  cwd: string,
  artifacts: string[],
  push: boolean = true,
  synopsis: string | null = null,
  privateTree: boolean = false
): AutoCommitResult | null {
  try {
    if (privateTree) {
      // B14 (worktree mode): the tree is private to this leaf, so staging
      // everything is safe — and necessary. The SDK artifact tracker only
      // sees Write/Edit paths; files a leaf creates via Bash (npx create-*,
      // codegen, cp) are invisible to it, and anything unstaged is destroyed
      // at worktree teardown. The F4 artifact-scoping below exists to stop
      // cross-leaf absorption in a SHARED tree — inapplicable here.
      execFileSync("git", ["add", "-A"], {
        cwd,
        maxBuffer: GIT_MAX_BUFFER,
      });
    } else {
      // F4 (Bug 2): stage only THIS leaf's Write/Edit paths. The previous
      // `git add -A` pattern grabbed every modified file in the shared
      // working tree — including files that parallel leaves had written
      // but not yet committed. Whichever leaf hit the serialized commit
      // queue first absorbed everyone's pending work; later leaves saw an
      // empty `git status` and returned null with no feat branch stamped.
      // (Run8 talent-onboarding hit exactly this — its 26 files committed
      // under DISCOVERY's commit, no feat/talent-onboarding branch.)
      //
      // De-dup + path-resolve artifacts so we don't pass duplicates or
      // absolute paths git would reject. Strip cwd prefix so paths are
      // relative to the repo root.
      const cwdAbs = path.resolve(cwd) + path.sep;
      const stagedPaths = Array.from(
        new Set(
          artifacts
            .map((a) => path.resolve(a))
            .filter((a) => a.startsWith(cwdAbs))
            .map((a) => a.slice(cwdAbs.length))
        )
      );

      if (stagedPaths.length === 0) {
        // Leaf produced no Write/Edit artifacts the SDK tracked — likely
        // a no-op leaf (skipped, already-done, or pure-validation pass).
        return null;
      }

      // Use --all so deletes are also staged, scoped to the leaf's paths.
      execFileSync("git", ["add", "--all", "--", ...stagedPaths], {
        cwd,
        maxBuffer: GIT_MAX_BUFFER,
      });
    }

    // Verify something was actually staged (artifact paths could be
    // unchanged if the leaf rewrote files identically). If nothing
    // staged, bail before commit so we don't create an empty commit.
    const staged = execFileSync(
      "git",
      ["diff", "--cached", "--name-only"],
      { cwd, encoding: "utf-8", maxBuffer: GIT_MAX_BUFFER }
    ).trim();
    if (!staged) return null;

    const tag = leaf.biome.replace(/-agent$/, "").toUpperCase();
    const branchName = `feat/${leaf.id}`;
    const subject = `${tag}/${leaf.id}: ${leaf.scope}`;
    // F7: bake `Synopsis: <one sentence>` into the commit body so the
    // dashboard can re-read it via git log later. Multi -m flags become
    // body paragraphs separated by blank lines.
    const commitArgs = ["commit", "-m", subject];
    if (synopsis) {
      commitArgs.push("-m", `Synopsis: ${synopsis}`);
    }
    commitArgs.push("--no-verify");
    execFileSync("git", commitArgs, {
      cwd,
      stdio: "pipe",
      maxBuffer: GIT_MAX_BUFFER,
    });

    // Capture the resulting SHA before any sibling leaf advances HEAD.
    // The serialized commit queue guarantees HEAD == this leaf's commit
    // right here, so rev-parse HEAD is safe at this exact instant.
    let sha: string | null = null;
    try {
      sha = execFileSync(
        "git",
        ["rev-parse", "HEAD"],
        { cwd, encoding: "utf-8", maxBuffer: GIT_MAX_BUFFER }
      ).trim();
    } catch {}

    // Stamp the per-biome branch to point at this commit so `mycelium
    // harvest` finds it. 0.1: in worktree mode the worktree is ALREADY on
    // feat/<id> (created via `worktree add -B`), so the commit landed on the
    // branch directly — `git branch -f` on a checked-out branch would error.
    // Only force-stamp when we're not already on the target branch (legacy
    // shared-tree path, where the serialized commit queue guarantees HEAD is
    // this leaf's commit at this instant).
    let currentBranch = "";
    try {
      currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd,
        encoding: "utf-8",
        maxBuffer: GIT_MAX_BUFFER,
      }).trim();
    } catch {}
    if (currentBranch !== branchName) {
      try {
        execFileSync("git", ["branch", "-f", branchName, "HEAD"], {
          cwd,
          stdio: "pipe",
          maxBuffer: GIT_MAX_BUFFER,
        });
      } catch (branchErr: any) {
        // Non-fatal: if branch stamping fails (rare), the commit still landed.
        const errMsg = String(branchErr?.stderr ?? branchErr?.message ?? branchErr);
        console.error(
          chalk.yellow(`  ⚠️  feat/${leaf.id} branch stamp failed: ${errMsg.split("\n")[0]}`)
        );
      }
    }

    // Push — set upstream on first push per branch, swallow no-remote errors.
    let pushStatus = "committed";
    if (!push) {
      return { message: chalk.gray(`committed (no-push) ${branchName}`), sha };
    }
    try {
      execFileSync("git", ["push", "--set-upstream", "origin", branchName], {
        cwd,
        stdio: "pipe",
        maxBuffer: GIT_MAX_BUFFER,
      });
      pushStatus = "committed+pushed";
    } catch (pushErr: any) {
      const errMsg = String(pushErr?.stderr ?? pushErr?.message ?? pushErr);
      if (/no.*origin|does not appear to be a git repository|No such remote/i.test(errMsg)) {
        pushStatus = "committed (no remote)";
      } else {
        pushStatus = `committed (push failed: ${errMsg.split("\n")[0].slice(0, 60)})`;
      }
    }

    return { message: chalk.gray(`${pushStatus} ${branchName}`), sha };
  } catch (err: any) {
    return {
      message: chalk.yellow(`commit skipped: ${err?.message?.split("\n")[0] ?? err}`),
      sha: null,
    };
  }
}

function summarizeTool(name: string, input: any): string {
  if (!input) return "";
  if (name === "Write" || name === "Edit" || name === "Read") {
    return input.file_path ?? "";
  }
  if (name === "Bash") {
    return (input.command ?? "").split("\n")[0].slice(0, 60);
  }
  if (name === "Glob" || name === "Grep") {
    return input.pattern ?? "";
  }
  return "";
}

// ── UI helpers ─────────────────────────────────────────────────────────

function banner(
  organism: any,
  agents: Agent[],
  gating: string,
  cellular: boolean,
  opts: any
): void {
  console.log();
  console.log(chalk.magentaBright.bold("  ╔══════════════════════════════════════════╗"));
  console.log(chalk.magentaBright.bold("  ║                                          ║"));
  console.log(chalk.magentaBright.bold("  ║   🌍  CULTIVATING THE ORGANISM  🌍        ║"));
  console.log(chalk.magentaBright.bold("  ║                                          ║"));
  console.log(chalk.magentaBright.bold("  ╚══════════════════════════════════════════╝"));
  console.log();

  if (opts.dryRun) {
    console.log(chalk.yellow.bold("  ⚠️  DRY RUN MODE — no sessions will spawn\n"));
  }

  console.log(
    chalk.gray("  Organism: ") +
      chalk.white.bold(organism.name) +
      chalk.gray(" | Target: ") +
      chalk.cyan(organism.ship_target || "unset") +
      chalk.gray(" | Biomes: ") +
      chalk.cyan(String(agents.length)) +
      chalk.gray(" | Mode: ") +
      chalk.cyan(cellular ? "cellular" : "flat")
  );
}

function summary(results: LeafResult[], organism: any): void {
  const ok = results.filter((r) => r.success);
  const fail = results.filter((r) => !r.success);
  const totalFiles = results.reduce((n, r) => n + r.artifacts.length, 0);
  const totalMs = results.reduce((n, r) => Math.max(n, r.ms), 0);

  console.log(chalk.gray("  " + "═".repeat(50)));
  console.log();

  if (fail.length === 0) {
    console.log(chalk.greenBright.bold("  🍄 The organism is alive!"));
  } else {
    console.log(
      chalk.yellow.bold(
        `  🍂 Organism partially grown — ${fail.length}/${results.length} leaves failed`
      )
    );
  }

  console.log();
  console.log(
    chalk.gray("  ") +
      chalk.white(`${ok.length}/${results.length} leaves FRUIT_READY`) +
      chalk.gray(" · ") +
      chalk.white(`${totalFiles} files produced`) +
      chalk.gray(" · wall-clock ") +
      chalk.white(`${(totalMs / 1000).toFixed(1)}s`)
  );

  if (fail.length > 0) {
    console.log();
    console.log(chalk.red("  Failed leaves:"));
    for (const r of fail) {
      console.log(
        chalk.red("    ✗ ") +
          chalk.white(r.leaf.id) +
          chalk.gray(" — ") +
          chalk.red((r.error ?? "unknown").split("\n")[0].slice(0, 120))
      );
      if (r.logPath) {
        console.log(chalk.gray("        log: ") + chalk.yellow(r.logPath));
      }
    }
  }

  const threshold = organism.harvest_threshold ?? 0.8;
  const health = ok.length / Math.max(1, results.length);
  console.log();
  console.log(
    chalk.gray("  Organism health: ") +
      chalk.white(`${(health * 100).toFixed(0)}%`) +
      chalk.gray(" (harvest threshold: ") +
      chalk.cyan(`${(threshold * 100).toFixed(0)}%`) +
      chalk.gray(")")
  );

  console.log();
  if (health >= threshold) {
    console.log(
      chalk.green("  Ready to harvest: ") +
        chalk.cyan("mycelium harvest")
    );
  } else {
    console.log(
      chalk.yellow("  Below harvest threshold — re-run failed leaves with ") +
        chalk.cyan("mycelium cultivate --only-biome <id>")
    );
  }
  console.log();
  console.log(
    chalk.magentaBright.italic(
      "  The mycelium grows. The network provides. 🌿"
    )
  );
  console.log();
}
