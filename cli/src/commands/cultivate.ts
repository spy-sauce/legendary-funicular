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

      const leaves: Leaf[] = biomes.flatMap((biome) => flattenBiome(biome));

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
                upgradeCtx
              );
              if (upgrades.length > 0) {
                await runAfterLeaf(upgrades, upgradeCtx, leaf, result);
              }
              return result;
            }
          );
          allResults.push(...results);
          console.log();
        }
      } catch (err) {
        if (upgrades.length > 0) {
          await runOnCrash(upgrades, upgradeCtx, err);
        }
        throw err;
      }

      // ── Report ─────────────────────────────────────────────────────
      summary(allResults, organism);
    });
}

// ── Session lifecycle ──────────────────────────────────────────────────
// Every live Claude Agent SDK Query goes in this set so we can cleanly
// interrupt + release all of them on error or ctrl-c.

const activeSessions = new Set<any>();

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
    if (count === 0) {
      process.exit(130);
    }
    console.log();
    console.log(chalk.yellow.bold(`  ✋ Interrupt received — closing ${count} active session(s)...`));
    const pending = Array.from(activeSessions);
    activeSessions.clear();
    await Promise.allSettled(pending.map((s) => closeStream(s)));
    console.log(chalk.yellow("  🍂 Sessions closed. Exiting."));
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
      // cycle / dead-end: dump the rest into one final wave
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

// ── Concurrency-limited promise pool ───────────────────────────────────

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    () => runner()
  );
  await Promise.all(runners);
  return results;
}

// ── The actual SDK spawn per leaf ──────────────────────────────────────

async function cultivateLeaf(
  leaf: Leaf,
  targetDir: string,
  config: any,
  logDir: string,
  upgrades: Upgrade[] = [],
  upgradeCtx?: UpgradeCtx
): Promise<LeafResult> {
  const started = Date.now();
  const spinner = ora({
    text: chalk.cyan(`🌱 ${leaf.id}`) + chalk.gray(` — ${leaf.scope}`),
    spinner: "dots",
    indent: 2,
  }).start();

  let prompt = buildLeafPrompt(leaf, config);
  if (upgrades.length > 0 && upgradeCtx) {
    prompt = await runTransformPrompt(upgrades, upgradeCtx, leaf, prompt);
  }
  const artifacts: string[] = [];
  const logPath = path.join(logDir, `${leaf.id}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const logLine = (obj: any) => logStream.write(JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n");
  logLine({ event: "start", leaf: leaf.id, scope: leaf.scope, branch: leaf.branch, lineage: leaf.lineage });
  logLine({ event: "prompt", prompt });

  let stream: any;
  try {
    stream = query({
      prompt,
      options: {
        cwd: targetDir,
        allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        permissionMode: "acceptEdits",
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
          }
        }
      }
    }

    // ── Auto-commit via serialized queue (no git race) ──────────
    const commitMsg = await commitQueue.enqueue(async () => {
      return autoCommitLeaf(leaf, targetDir, artifacts, (config as any)._push !== false);
    });

    // ── Mark in SporeNet if state.json exists ───────────────────
    try {
      const statePath = path.join(targetDir, "sporenet", "state.json");
      if (fs.existsSync(statePath)) {
        const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
        const stateLeaf = state.leaves.find((l: any) => l.id === leaf.id);
        if (stateLeaf) {
          stateLeaf.status = "done";
          stateLeaf.completed_at = new Date().toISOString();
          const shaMatch = (commitMsg ?? "").match(/\b[0-9a-f]{7,40}\b/);
          if (shaMatch) stateLeaf.commit = shaMatch[0];
          else if ((commitMsg ?? "").includes("committed")) {
            try {
              const sha = execFileSync("git", ["-C", targetDir, "rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
              stateLeaf.commit = sha;
            } catch {}
          }
          fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        }
      }
    } catch {
      // SporeNet sync is best-effort only
    }

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
  }
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
    `The network provides. Grow in your lane. 🍄`,
  ].join("\n");
}

// ── Serialized git queue — prevents parallel git races ─────────────────

class CommitQueue {
  private chain: Promise<any> = Promise.resolve();
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
const commitQueue = new CommitQueue();

function autoCommitLeaf(
  leaf: Leaf,
  cwd: string,
  artifacts: string[],
  push: boolean = true
): string | null {
  try {
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf-8",
    }).trim();
    if (!status) return null;

    const tag = leaf.biome.replace(/-agent$/, "").toUpperCase();
    const msg = `${tag}/${leaf.id}: ${leaf.scope}`;
    execFileSync("git", ["add", "-A"], { cwd });
    execFileSync("git", ["commit", "-m", msg, "--no-verify"], {
      cwd,
      stdio: "pipe",
    });

    // Push — set upstream on first push per branch, swallow no-remote errors.
    let pushStatus = "committed";
    if (!push) {
      return chalk.gray(`committed (no-push) ${tag}/${leaf.id}`);
    }
    try {
      const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd,
        encoding: "utf-8",
      }).trim();
      execFileSync("git", ["push", "--set-upstream", "origin", branch], {
        cwd,
        stdio: "pipe",
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

    return chalk.gray(`${pushStatus} ${tag}/${leaf.id}`);
  } catch (err: any) {
    return chalk.yellow(`commit skipped: ${err?.message?.split("\n")[0] ?? err}`);
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
