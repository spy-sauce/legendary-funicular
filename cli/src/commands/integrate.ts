// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium integrate <sourceDir>` — read a source organism's mycelium.yaml,
// NUTRIENTS.md, and CLAUDE.md, then write integration config artifacts directly
// into the target platform's integrations/<source-name>/ folder.
//
// Default mode: --into <ddp-dir> writes to <ddp-dir>/integrations/<source-name>/
// No standalone organism directory. The platform owns the integration configs.

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { query } from "@anthropic-ai/claude-agent-sdk";

const TARGETS: Record<string, { name: string; description: string }> = {
  ddp: {
    name: "digital-dash-production",
    description:
      "AI-native CI/CD — push code → tree-sitter analysis → Claude-generated tests → Docker runner → live WebSocket dashboard",
  },
};

export function registerIntegrateCommand(program: Command): void {
  program
    .command("integrate <sourceDir>")
    .description(
      "🔗 Wire a source organism into a target platform — scaffolds the full integration organism"
    )
    .option(
      "-t, --target <name>",
      `Target platform (${Object.keys(TARGETS).join(", ")})`,
      "ddp"
    )
    .option("-n, --name <name>", "Override integration folder name (default: source organism name)")
    .option(
      "-i, --into <platformDir>",
      "Target platform directory — writes to <platformDir>/integrations/<name>/ (recommended)"
    )
    .option("-d, --dir <dir>", "Standalone output directory (use --into instead when possible)", process.cwd())
    .option("--dry-run", "Print the prompt without invoking the SDK", false)
    .action(async (sourceDir: string, opts) => {
      const sourceAbs = path.resolve(sourceDir);

      // Validate source organism has the required trio
      for (const f of ["mycelium.yaml", "NUTRIENTS.md", "CLAUDE.md"]) {
        if (!fs.existsSync(path.join(sourceAbs, f))) {
          console.log(
            chalk.red(`  ❌ Source organism missing ${f}: `) +
              chalk.yellow(path.join(sourceAbs, f))
          );
          process.exit(1);
        }
      }

      // Validate target
      const target = TARGETS[opts.target];
      if (!target) {
        console.log(
          chalk.red(`  ❌ Unknown target "${opts.target}". Supported: `) +
            chalk.cyan(Object.keys(TARGETS).join(", "))
        );
        process.exit(1);
      }

      // Read source organism
      const sourceYaml = fs.readFileSync(
        path.join(sourceAbs, "mycelium.yaml"),
        "utf-8"
      );
      const sourceNutrients = fs.readFileSync(
        path.join(sourceAbs, "NUTRIENTS.md"),
        "utf-8"
      );
      const sourceClaude = fs.readFileSync(
        path.join(sourceAbs, "CLAUDE.md"),
        "utf-8"
      );

      // Parse biome list
      const parsed = YAML.parse(sourceYaml);
      const sourceOrgName: string =
        parsed?.organism?.name ?? path.basename(sourceAbs);
      const sourceAgents: any[] = parsed?.agents ?? [];
      const biomeCount = sourceAgents.length;

      // Derive output directory:
      //   --into <platformDir>  →  <platformDir>/integrations/<name>/   (recommended)
      //   --dir  <parentDir>    →  <parentDir>/<name>-x-<target>/       (standalone fallback)
      const folderName = opts.name ?? sourceOrgName;
      const outputDir = opts.into
        ? path.resolve(opts.into, "integrations", folderName)
        : path.resolve(opts.dir, `${folderName}-x-${opts.target}`);

      // Leaf count math
      const analysisLeaves = biomeCount * 2;   // discovery + parse per biome
      const generationLeaves = biomeCount * 2; // template + fixtures per biome
      const totalLeaves = 3 + 4 + analysisLeaves + generationLeaves + 4;

      const mode = opts.into
        ? chalk.green("embedded") + chalk.gray(` → ${path.resolve(opts.into)}/integrations/${folderName}/`)
        : chalk.yellow("standalone") + chalk.gray(` → ${outputDir}`);

      console.log();
      console.log(
        chalk.magentaBright.bold("  🔗 Integrating ") +
          chalk.white.bold(sourceOrgName) +
          chalk.gray(" → ") +
          chalk.cyan(target.name)
      );
      console.log(chalk.gray("  Source:  ") + chalk.yellow(sourceAbs));
      console.log(
        chalk.gray("  Target:  ") +
          chalk.cyan(opts.target) +
          chalk.gray(` (${target.description.split("—")[0].trim()})`)
      );
      console.log(chalk.gray("  Mode:    ") + mode);
      console.log(
        chalk.gray("  Biomes:  ") +
          chalk.white(String(biomeCount)) +
          chalk.gray(
            ` source biomes → ${analysisLeaves} analysis + ${generationLeaves} generation leaves`
          )
      );
      console.log(
        chalk.gray("  Leaves:  ") +
          chalk.white(String(totalLeaves)) +
          chalk.gray(" across 4 waves (registration=3 bridge=4 analysis=") +
          chalk.white(String(analysisLeaves)) +
          chalk.gray(" generation=") +
          chalk.white(String(generationLeaves)) +
          chalk.gray(" verification=4)")
      );
      console.log();

      const prompt = buildIntegratePrompt({
        sourceOrgName,
        sourceYaml,
        sourceNutrients,
        sourceClaude,
        sourceAbs,
        outputDir,
        targetKey: opts.target,
        targetName: target.name,
        targetDescription: target.description,
        integrationName: folderName,
        biomeCount,
        analysisLeaves,
        generationLeaves,
        totalLeaves,
        sourceAgents,
      });

      if (opts.dryRun) {
        console.log(chalk.gray("── Integration prompt ──"));
        console.log(prompt);
        return;
      }

      // Create output directory skeleton
      fs.mkdirSync(path.join(outputDir, "hyphae"), { recursive: true });
      fs.mkdirSync(path.join(outputDir, "config", "analysis"), { recursive: true });
      fs.mkdirSync(path.join(outputDir, "config", "generation"), { recursive: true });
      fs.mkdirSync(path.join(outputDir, "bridge"), { recursive: true });
      fs.mkdirSync(path.join(outputDir, "verification"), { recursive: true });

      const spinner = ora({
        text: chalk.cyan(
          `Scaffolding ${totalLeaves}-leaf integration organism...`
        ),
        spinner: "earth",
      }).start();

      try {
        const result = query({
          prompt,
          options: {
            cwd: outputDir,
            allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            permissionMode: "acceptEdits",
          },
        });

        let lastText = "";
        for await (const msg of result) {
          if (msg.type === "assistant") {
            const blocks = (msg as any).message?.content ?? [];
            for (const b of blocks) {
              if (b.type === "tool_use") {
                spinner.text = chalk.cyan(
                  `Scaffolding: ${chalk.white(b.name)} ${chalk.gray(
                    summarizeInput(b.name, b.input)
                  )}`
                );
              } else if (b.type === "text" && b.text) {
                lastText = b.text;
              }
            }
          }
        }

        spinner.succeed(
          chalk.greenBright(`${folderName} scaffolded — ${totalLeaves} leaves ready`)
        );

        if (lastText) {
          console.log();
          console.log(chalk.gray("  ── Summary ──"));
          console.log(
            lastText
              .split("\n")
              .map((l) => chalk.gray("  ") + l)
              .join("\n")
          );
        }

        console.log();
        console.log(chalk.green("  Next steps:"));
        if (opts.into) {
          console.log(
            chalk.gray("    1. ") +
              chalk.white("cd ") +
              chalk.yellow(outputDir)
          );
          console.log(chalk.gray("    2. ") + chalk.cyan("mycelium contracts freeze"));
          console.log(
            chalk.gray("    3. ") +
              chalk.cyan("mycelium cultivate -c 20") +
              chalk.gray(` — ${totalLeaves} leaves inside ${path.basename(path.resolve(opts.into))}/integrations/${folderName}/`)
          );
        } else {
          console.log(
            chalk.gray("    1. ") + chalk.white("cd ") + chalk.yellow(outputDir)
          );
          console.log(chalk.gray("    2. ") + chalk.cyan("mycelium contracts freeze"));
          console.log(
            chalk.gray("    3. ") +
              chalk.cyan("mycelium cultivate -c 20") +
              chalk.gray(` — ${totalLeaves} leaves, 4 waves`)
          );
          console.log(
            chalk.gray("       ") +
              chalk.dim("tip: use --into <ddp-dir> next time to embed directly in the platform")
          );
        }
        console.log();
      } catch (err: any) {
        spinner.fail(chalk.red("Integration scaffold failed"));
        console.log(chalk.red(err?.message ?? String(err)));
        process.exit(1);
      }
    });
}

function summarizeInput(name: string, input: any): string {
  if (!input) return "";
  if (name === "Write" || name === "Edit" || name === "Read") {
    return input.file_path ?? "";
  }
  if (name === "Bash") {
    return (input.command ?? "").split("\n")[0].slice(0, 60);
  }
  return "";
}

function buildIntegratePrompt(args: {
  sourceOrgName: string;
  sourceYaml: string;
  sourceNutrients: string;
  sourceClaude: string;
  sourceAbs: string;
  outputDir: string;
  targetKey: string;
  targetName: string;
  targetDescription: string;
  integrationName: string;
  biomeCount: number;
  analysisLeaves: number;
  generationLeaves: number;
  totalLeaves: number;
  sourceAgents: any[];
}): string {
  const {
    sourceOrgName,
    sourceYaml,
    sourceNutrients,
    sourceClaude,
    sourceAbs,
    outputDir,
    targetKey,
    targetName,
    targetDescription,
    integrationName,
    biomeCount,
    analysisLeaves,
    generationLeaves,
    totalLeaves,
    sourceAgents,
  } = args;

  const biomeListText = sourceAgents
    .map((a) => `  - ${a.id}: ${a.scope ?? ""}`)
    .join("\n");

  // Build analysis sub_agents block for mycelium.yaml
  const analysisSubAgents = sourceAgents
    .map((a) => {
      const slug = a.id.replace(/-agent$/, "");
      return [
        `      - id: analysis.${slug}`,
        `        scope: Analyzer config for ${sourceOrgName} ${a.id}`,
        `        sub_agents:`,
        `          - id: analysis.${slug}.discovery`,
        `            scope: Write config/analysis/${slug}-discovery.json — file globs for this biome`,
        `          - id: analysis.${slug}.parse`,
        `            scope: Write config/analysis/${slug}-parse.json — tree-sitter extraction config`,
      ].join("\n");
    })
    .join("\n");

  // Build generation sub_agents block for mycelium.yaml
  const generationSubAgents = sourceAgents
    .map((a) => {
      const slug = a.id.replace(/-agent$/, "");
      return [
        `      - id: generation.${slug}`,
        `        scope: Test generation config for ${sourceOrgName} ${a.id}`,
        `        sub_agents:`,
        `          - id: generation.${slug}.template`,
        `            scope: Write config/generation/${slug}-template.md — test scaffold for this biome`,
        `          - id: generation.${slug}.fixtures`,
        `            scope: Write config/generation/${slug}-fixtures.json — mock data from source NUTRIENTS`,
      ].join("\n");
    })
    .join("\n");

  const biomeIdList = sourceAgents.map((a) => a.id).join(", ");

  return `You are the Mycelium integration sub-agent. Your job is to scaffold a complete
integration organism that wires the source organism "${sourceOrgName}" into the
"${targetKey}" target platform.

The integration organism follows a fixed 5-biome topology. What varies per source
organism is the analysis and generation biomes — they each spawn one depth-2
specialist per source biome, so ${biomeCount} source biomes → ${analysisLeaves} analysis
leaves + ${generationLeaves} generation leaves = ${totalLeaves} total leaves.

══════════════════════════════════════════════
SOURCE ORGANISM: ${sourceOrgName}
Path (READ-ONLY — never write here): ${sourceAbs}
Biome count: ${biomeCount}
══════════════════════════════════════════════

SOURCE mycelium.yaml:
\`\`\`yaml
${sourceYaml}
\`\`\`

SOURCE NUTRIENTS.md:
\`\`\`markdown
${sourceNutrients}
\`\`\`

SOURCE CLAUDE.md:
\`\`\`markdown
${sourceClaude}
\`\`\`

══════════════════════════════════════════════
TARGET PLATFORM: ${targetKey} — ${targetName}
${targetDescription}
══════════════════════════════════════════════

For the "ddp" target:
- DDP analyzes code with tree-sitter, generates tests via Claude API (sonnet-4-6),
  runs them in sandboxed Docker containers, and streams results via WebSocket
- DDP's 11 test tiers: smoke, component, contract, integration, regression, e2e,
  a11y, performance, security, chaos, mutation
- Not all tiers apply to every biome — prune to relevant tiers per biome's scope
- Source organism stays untouched; integration organism reads it but never writes to it

══════════════════════════════════════════════
YOUR TASK — produce exactly 9 files using the Write tool
IMPORTANT: Your current working directory is: ${outputDir}
All Write tool paths must be absolute and start with: ${outputDir}/
══════════════════════════════════════════════

SOURCE BIOMES driving analysis + generation sub-agent count:
${biomeListText}

────────────────────────────────────────────
FILE 1: mycelium.yaml
────────────────────────────────────────────

Write the organism config using this exact structure. Fill in the sub_agents
blocks below verbatim — they are pre-derived from the source biome list:

\`\`\`yaml
# Mycelium Framework — VibeSpace LLC — The network provides.

organism:
  name: ${integrationName}
  ship_target: "<3 days from today>"
  health_pulse_interval: 30
  harvest_threshold: 0.85
  cellular: true
  gating: contract-freeze
  max_depth: 3
  upgrades:
    - cache-headers
    - hypha-validator
    - depth-3-enforcement
    - crash-recovery

contracts:
  - path: NUTRIENTS.md#source-project-registration
    frozen: false
  - path: NUTRIENTS.md#biome-test-config
    frozen: false
  - path: NUTRIENTS.md#bridge-contract-map
    frozen: false
  - path: NUTRIENTS.md#verification-verdict
    frozen: false

agents:
  - id: registration-agent
    scope: Register ${sourceOrgName} as a ${targetKey} project; produce project-entity payload, webhook setup, API key guide
    branch: feat/registration
    blocked_by: []
    blocks: []
    capabilities: [python, fastapi-client, github-webhooks]
    sub_agents:
      - id: registration.project-create
        scope: Write config/project.json — ${sourceOrgName} registration payload matching ${targetKey}'s project-entity contract
      - id: registration.webhook-configure
        scope: Write config/github-app.md — GitHub App installation steps, webhook endpoint, HMAC secret placeholder
      - id: registration.api-key-scope
        scope: Write config/api-key-setup.md — API key scoping instructions (dd_ prefix, .env.${integrationName})

  - id: bridge-agent
    scope: Map ${sourceOrgName}'s contracts to ${targetKey}'s input shapes; produce bridge/ translation artifacts
    branch: feat/bridge
    blocked_by: []
    blocks: []
    capabilities: [python, pydantic, contract-translation]
    sub_agents:
      - id: bridge.user-mapping
        scope: Write bridge/user-bridge.py — bidirectional converters for any user entity schema divergences
      - id: bridge.contract-index
        scope: Write bridge/contract-index.md — full mapping of source contracts to ${targetKey} contracts
      - id: bridge.error-harmonize
        scope: Write bridge/error-codes.md — merged error code registry, shared vs. source-only vs. target-only
      - id: bridge.stack-profile
        scope: Write bridge/stack-profile.json — ${sourceOrgName} runtime profile for ${targetKey}'s analyzer

  - id: analysis-agent
    scope: Configure ${targetKey}'s file-discovery and tree-sitter parser for each of ${sourceOrgName}'s ${biomeCount} biomes
    branch: feat/analysis
    blocked_by: []
    blocks: []
    capabilities: [tree-sitter, file-discovery, python]
    sub_agents:
${analysisSubAgents}

  - id: generation-agent
    scope: Produce per-biome test templates and fixtures for ${targetKey}'s generator; ${biomeCount} biome specialists
    branch: feat/generation
    blocked_by: []
    blocks: []
    capabilities: [pytest, vitest, playwright, prompt-engineering]
    sub_agents:
${generationSubAgents}

  - id: verification-agent
    scope: Produce execution plan, runner config, results schema, and health report template
    branch: feat/verification
    blocked_by: []
    blocks: []
    capabilities: [python, pytest, orchestration]
    sub_agents:
      - id: verification.orchestration-plan
        scope: Write verification/execution-plan.md — biome × tier active cell matrix + wave ordering
      - id: verification.runner-config
        scope: Write verification/runner-config.json — ${targetKey} runner settings for ${sourceOrgName}'s stack
      - id: verification.results-schema
        scope: Write verification/results-schema.json — JSON Schema for verification/results.json
      - id: verification.health-report
        scope: Write verification/HEALTH-REPORT-template.md — 12-row × 11-col health grid template

merge_order:
  - registration-agent
  - bridge-agent
  - analysis-agent
  - generation-agent
  - verification-agent

timeline:
  contract_freeze: "hour 0 — run: mycelium contracts freeze"
  integration_checkpoints:
    - hour: 2
      checkpoint: registration + bridge fruiting — ${targetKey} project config ready, contract bridge written
    - hour: 6
      checkpoint: analysis-agent fruiting — all ${analysisLeaves} biome discovery+parse configs written
    - hour: 10
      checkpoint: generation-agent fruiting — all ${generationLeaves} biome test templates+fixtures written
    - hour: 14
      checkpoint: verification-agent fruiting — execution plan, runner config, results schema, health report ready
\`\`\`

────────────────────────────────────────────
FILE 2: CLAUDE.md
────────────────────────────────────────────

Context document for all leaves. Include:
- What we're building (1-paragraph: wiring ${sourceOrgName} into ${targetKey})
- Architecture diagram (3-layer: legendary-funicular → source+target → this organism)
- CRITICAL decoupling rule: ${sourceAbs} and the ${targetKey} repo are READ ONLY — never write into them
- Source paths (read-only): list the 3 files from ${sourceAbs}
- Output paths (write here): config/analysis/, config/generation/, bridge/, verification/
- Stack: JSON + Markdown output only; Python 3.12 + Pydantic v2 for bridge converters; no HTTP calls, no Docker
- Critical facts about ${sourceOrgName}: extract ports, frameworks, auth approach from the source CLAUDE.md above
- Rules (non-negotiable): 8 bullet points covering path safety, secrets, frozen contracts, ports
- Biome stream tags: BRIDGE/REGISTRATION, BRIDGE/CONTRACT, BRIDGE/ANALYSIS, BRIDGE/GENERATION, BRIDGE/VERIFICATION
- Forbidden patterns (no HTTP calls, no docker run, no hardcoded secrets)
- Ship target: 3 days, ${totalLeaves} leaves at -c 20, checkpoints at hours 2/6/10/14

────────────────────────────────────────────
FILE 3: NUTRIENTS.md
────────────────────────────────────────────

Define 4 bridge contracts. Derive actual values from the source organism's contracts.

1. **source-project-registration** — registration record shape. Include fields:
   project_id (UUID), repo_url (HttpUrl), api ports (extract from source CLAUDE.md),
   webhook_configured (bool), api_key_scoped (bool). Mock payload with real port values.

2. **biome-test-config** — per-biome config shape. Fields: biome_id, file_globs list,
   language list, active_tiers list, source_contract_anchors list, config file paths.
   Mock example for one of the source biomes.

3. **bridge-contract-map** — mapping entry shape. Fields: source_anchor, target_equivalent
   (nullable), compatibility ("shared"|"schema-diverges"|"source-only"), bridge_notes.
   Full mapping JSON array covering all contracts from the source NUTRIENTS.md.

4. **verification-verdict** — health report shape. Fields: organism, pipeline_id, run_id,
   timestamp, overall_score (float), biome_verdicts (dict), token_cost_usd, duration_ms,
   passed (bool, threshold 0.85). Mock with one biome example.

────────────────────────────────────────────
FILE 4: CELLULAR-MAP.md
────────────────────────────────────────────

Execution tree showing all ${biomeCount} analysis specialists and ${biomeCount} generation specialists.
Include:
- Full tree (5 biomes, all sub-agents and leaves)
- Wave table: Wave 1=7, Wave 2=${analysisLeaves}, Wave 3=${generationLeaves}, Wave 4=4
- Biome × tier pruning table: all ${biomeCount} source biomes × 11 DDP tiers, mark active cells,
  derive which tiers apply based on each biome's actual scope
- Merge order with rationale

────────────────────────────────────────────
FILES 5-9: hyphae/HYPHA-<BIOME>-AGENT.md (5 files)
────────────────────────────────────────────

Each HYPHA file must follow this structure:
- CACHE HEADER (scope, primitives, rules, coupling, load-when)
- Scope (full description)
- Deliverables by leaf (one section per leaf with file path + content requirements)
- Contract dependencies (produces / consumes)
- Acceptance criteria (testable bullets)
- Out of scope
- Merge instructions

**HYPHA-REGISTRATION-AGENT.md**: covers config/project.json, config/github-app.md, config/api-key-setup.md.
Reference ${targetKey}'s project-entity contract for the registration payload shape.

**HYPHA-BRIDGE-AGENT.md**: covers bridge/user-bridge.py, bridge/contract-index.md,
bridge/error-codes.md, bridge/stack-profile.json. List every schema divergence between
source and ${targetKey} contracts derived from both NUTRIENTS.md files.

**HYPHA-ANALYSIS-AGENT.md**: covers all ${analysisLeaves} config/analysis/ files.
For EACH of the ${biomeCount} source biomes (${biomeIdList}):
- Read the source organism's HYPHA file (at ${sourceAbs}/hyphae/HYPHA-<BIOME>-AGENT.md)
  to find the real file paths this biome produces — use the Read tool
- Include the discovery JSON schema and parse JSON schema templates
- Specify the correct file globs based on actual source organism structure
- Specify tree-sitter language bindings and focus patterns per biome

**HYPHA-GENERATION-AGENT.md**: covers all ${generationLeaves} config/generation/ files.
For EACH of the ${biomeCount} source biomes:
- Template writing rules (test framework, critical invariants, contract anchor references)
- Fixture writing rules (values from source NUTRIENTS.md mocks)
- Active test tiers per biome (derive from biome scope — e.g. auth → smoke+integration+security)
- For biomes with security-critical invariants (look for consent gates, audit logs, vault operations),
  document them explicitly

**HYPHA-VERIFICATION-AGENT.md**: covers verification/execution-plan.md, runner-config.json,
results-schema.json, HEALTH-REPORT-template.md.
Include the ${sourceOrgName}-specific biome × tier pruning table.
Include runner-config.json with actual port values from source CLAUDE.md.
Include JSON Schema for results.json validating the verification-verdict contract.

══════════════════════════════════════════════
CONSTRAINTS (never violate)
══════════════════════════════════════════════

1. Read source HYPHA files (${sourceAbs}/hyphae/) before writing analysis configs — use
   the Read tool to get accurate file paths, do not guess.
2. All file path references in configs are RELATIVE to the source organism root.
3. Extract port numbers and stack details from source CLAUDE.md — do not assume defaults.
4. Source NUTRIENTS.md mock payloads are ground truth for all fixture files.
5. Do NOT install dependencies, run builds, or commit.
6. Do NOT write into ${sourceAbs} or the ${targetKey} repo.
7. Write all 9 files. Finish with a markdown summary listing each file and any open questions.`;
}
