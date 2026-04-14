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
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { query } from "@anthropic-ai/claude-agent-sdk";
export function registerCultivateCommand(program) {
    program
        .command("cultivate")
        .description("🌍 Start the full organism — bring the mycelium to life")
        .option("--dry-run", "Print the execution plan without spawning sessions", false)
        .option("-c, --max-concurrency <n>", "Max simultaneous leaf sessions (default: 50)", (v) => parseInt(v, 10), 50)
        .option("--only-biome <id>", "Cultivate only one biome's dish (for targeted re-runs)")
        .action(async (opts) => {
        const configPath = path.join(process.cwd(), "mycelium.yaml");
        if (!fs.existsSync(configPath)) {
            console.log(chalk.red("  ❌ No mycelium.yaml found. Run ") +
                chalk.cyan("mycelium init") +
                chalk.red(" or ") +
                chalk.cyan("mycelium plant") +
                chalk.red(" first."));
            return;
        }
        const config = YAML.parse(fs.readFileSync(configPath, "utf-8"));
        const organism = config.organism || { name: "unknown" };
        const agents = config.agents || [];
        const gating = organism.gating || "wave";
        const cellular = organism.cellular === true;
        if (agents.length === 0) {
            console.log(chalk.yellow("  🌑 No agents to cultivate. Create some first with ") +
                chalk.cyan("mycelium agent create <name>"));
            return;
        }
        banner(organism, agents, gating, cellular, opts);
        // ── Flatten the tree to leaves ─────────────────────────────────
        const biomes = opts.onlyBiome
            ? agents.filter((a) => a.id === opts.onlyBiome)
            : agents;
        if (opts.onlyBiome && biomes.length === 0) {
            console.log(chalk.red(`  ❌ Biome "${opts.onlyBiome}" not found.`));
            return;
        }
        const leaves = biomes.flatMap((biome) => flattenBiome(biome));
        const waves = gating === "contract-freeze"
            ? [leaves] // one wave, all at once
            : buildLeafWaves(biomes, leaves);
        // ── Execution plan ─────────────────────────────────────────────
        console.log();
        console.log(chalk.magentaBright("  🧬 Execution plan\n"));
        console.log(chalk.gray("    Biomes:      ") + chalk.white(String(biomes.length)));
        console.log(chalk.gray("    Leaf agents: ") + chalk.white(String(leaves.length)));
        console.log(chalk.gray("    Waves:       ") + chalk.white(String(waves.length)));
        console.log(chalk.gray("    Concurrency: ") +
            chalk.white(String(opts.maxConcurrency)));
        console.log(chalk.gray("    Gating:      ") + chalk.cyan(gating));
        console.log();
        for (let i = 0; i < waves.length; i++) {
            console.log(chalk.gray(`    Wave ${i + 1} (${waves[i].length}):`));
            for (const leaf of waves[i]) {
                console.log(chalk.gray("      • ") +
                    chalk.cyan(leaf.id) +
                    chalk.gray(" — ") +
                    chalk.white(leaf.scope));
            }
        }
        console.log();
        if (opts.dryRun) {
            console.log(chalk.yellow.bold("  ⚠️  DRY RUN — no sessions spawned.\n"));
            return;
        }
        // ── Cultivation: spawn each wave with a concurrency limit ─────
        console.log(chalk.magentaBright("  🌱 Cultivating...\n"));
        const targetDir = process.cwd();
        const allResults = [];
        for (let w = 0; w < waves.length; w++) {
            const wave = waves[w];
            console.log(chalk.gray(`  ── Wave ${w + 1}/${waves.length} `) +
                chalk.gray("─".repeat(40)));
            const results = await runWithConcurrency(wave, opts.maxConcurrency, (leaf) => cultivateLeaf(leaf, targetDir, config));
            allResults.push(...results);
            console.log();
        }
        // ── Report ─────────────────────────────────────────────────────
        summary(allResults, organism);
    });
}
// ── Tree flattening ────────────────────────────────────────────────────
function flattenBiome(biome) {
    const out = [];
    const walk = (specs, lineage) => {
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
            }
            else {
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
function buildLeafWaves(biomes, leaves) {
    const byBiome = {};
    for (const l of leaves) {
        (byBiome[l.biome] ||= []).push(l);
    }
    const placed = new Set();
    const waves = [];
    let remaining = [...biomes];
    while (remaining.length > 0) {
        const ready = remaining.filter((b) => (b.blocked_by || []).every((dep) => placed.has(dep)));
        if (ready.length === 0) {
            // cycle / dead-end: dump the rest into one final wave
            waves.push(remaining.flatMap((b) => byBiome[b.id] || []));
            break;
        }
        const wave = ready.flatMap((b) => byBiome[b.id] || []);
        if (wave.length > 0)
            waves.push(wave);
        for (const b of ready)
            placed.add(b.id);
        remaining = remaining.filter((b) => !placed.has(b.id));
    }
    return waves;
}
// ── Concurrency-limited promise pool ───────────────────────────────────
async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    async function runner() {
        while (true) {
            const i = cursor++;
            if (i >= items.length)
                return;
            results[i] = await worker(items[i]);
        }
    }
    const runners = Array.from({ length: Math.min(limit, items.length) }, () => runner());
    await Promise.all(runners);
    return results;
}
// ── The actual SDK spawn per leaf ──────────────────────────────────────
async function cultivateLeaf(leaf, targetDir, config) {
    const started = Date.now();
    const spinner = ora({
        text: chalk.cyan(`🌱 ${leaf.id}`) + chalk.gray(` — ${leaf.scope}`),
        spinner: "dots",
        indent: 2,
    }).start();
    const prompt = buildLeafPrompt(leaf, config);
    const artifacts = [];
    try {
        const stream = query({
            prompt,
            options: {
                cwd: targetDir,
                allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
                permissionMode: "acceptEdits",
            },
        });
        for await (const msg of stream) {
            if (msg.type === "assistant") {
                const blocks = msg.message?.content ?? [];
                for (const b of blocks) {
                    if (b.type === "tool_use") {
                        const target = summarizeTool(b.name, b.input);
                        if (target) {
                            spinner.text =
                                chalk.cyan(`🌿 ${leaf.id}`) +
                                    chalk.gray(` → ${b.name} ${target}`);
                            if (b.name === "Write" || b.name === "Edit") {
                                if (b.input?.file_path)
                                    artifacts.push(b.input.file_path);
                            }
                        }
                    }
                }
            }
        }
        // ── Auto-commit via serialized queue (no git race) ──────────
        const commitMsg = await commitQueue.enqueue(async () => {
            return autoCommitLeaf(leaf, targetDir, artifacts);
        });
        const ms = Date.now() - started;
        spinner.succeed(chalk.green(`🍄 ${leaf.id}`) +
            chalk.gray(` FRUIT_READY (${artifacts.length} files, ${(ms / 1000).toFixed(1)}s)` +
                (commitMsg ? ` · ${commitMsg}` : "")));
        return { leaf, success: true, artifacts, ms };
    }
    catch (err) {
        const ms = Date.now() - started;
        spinner.fail(chalk.red(`⚠ ${leaf.id}`) +
            chalk.gray(` failed after ${(ms / 1000).toFixed(1)}s`));
        return {
            leaf,
            success: false,
            artifacts,
            error: err?.message ?? String(err),
            ms,
        };
    }
}
function buildLeafPrompt(leaf, config) {
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
    chain = Promise.resolve();
    enqueue(fn) {
        const next = this.chain.then(fn, fn);
        this.chain = next.catch(() => undefined);
        return next;
    }
}
const commitQueue = new CommitQueue();
function autoCommitLeaf(leaf, cwd, artifacts) {
    try {
        // Snapshot dirty state; if nothing changed, skip.
        const status = execFileSync("git", ["status", "--porcelain"], {
            cwd,
            encoding: "utf-8",
        }).trim();
        if (!status)
            return null;
        const tag = leaf.biome.replace(/-agent$/, "").toUpperCase();
        const msg = `${tag}/${leaf.id}: ${leaf.scope}`;
        execFileSync("git", ["add", "-A"], { cwd });
        execFileSync("git", ["commit", "-m", msg, "--no-verify"], {
            cwd,
            stdio: "pipe",
        });
        return chalk.gray(`committed ${tag}/${leaf.id}`);
    }
    catch (err) {
        return chalk.yellow(`commit skipped: ${err?.message?.split("\n")[0] ?? err}`);
    }
}
function summarizeTool(name, input) {
    if (!input)
        return "";
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
function banner(organism, agents, gating, cellular, opts) {
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
    console.log(chalk.gray("  Organism: ") +
        chalk.white.bold(organism.name) +
        chalk.gray(" | Target: ") +
        chalk.cyan(organism.ship_target || "unset") +
        chalk.gray(" | Biomes: ") +
        chalk.cyan(String(agents.length)) +
        chalk.gray(" | Mode: ") +
        chalk.cyan(cellular ? "cellular" : "flat"));
}
function summary(results, organism) {
    const ok = results.filter((r) => r.success);
    const fail = results.filter((r) => !r.success);
    const totalFiles = results.reduce((n, r) => n + r.artifacts.length, 0);
    const totalMs = results.reduce((n, r) => Math.max(n, r.ms), 0);
    console.log(chalk.gray("  " + "═".repeat(50)));
    console.log();
    if (fail.length === 0) {
        console.log(chalk.greenBright.bold("  🍄 The organism is alive!"));
    }
    else {
        console.log(chalk.yellow.bold(`  🍂 Organism partially grown — ${fail.length}/${results.length} leaves failed`));
    }
    console.log();
    console.log(chalk.gray("  ") +
        chalk.white(`${ok.length}/${results.length} leaves FRUIT_READY`) +
        chalk.gray(" · ") +
        chalk.white(`${totalFiles} files produced`) +
        chalk.gray(" · wall-clock ") +
        chalk.white(`${(totalMs / 1000).toFixed(1)}s`));
    if (fail.length > 0) {
        console.log();
        console.log(chalk.red("  Failed leaves:"));
        for (const r of fail) {
            console.log(chalk.red("    ✗ ") +
                chalk.white(r.leaf.id) +
                chalk.gray(" — ") +
                chalk.red(r.error ?? "unknown"));
        }
    }
    const threshold = organism.harvest_threshold ?? 0.8;
    const health = ok.length / Math.max(1, results.length);
    console.log();
    console.log(chalk.gray("  Organism health: ") +
        chalk.white(`${(health * 100).toFixed(0)}%`) +
        chalk.gray(" (harvest threshold: ") +
        chalk.cyan(`${(threshold * 100).toFixed(0)}%`) +
        chalk.gray(")"));
    console.log();
    if (health >= threshold) {
        console.log(chalk.green("  Ready to harvest: ") +
            chalk.cyan("mycelium harvest"));
    }
    else {
        console.log(chalk.yellow("  Below harvest threshold — re-run failed leaves with ") +
            chalk.cyan("mycelium cultivate --only-biome <id>"));
    }
    console.log();
    console.log(chalk.magentaBright.italic("  The mycelium grows. The network provides. 🌿"));
    console.log();
}
//# sourceMappingURL=cultivate.js.map