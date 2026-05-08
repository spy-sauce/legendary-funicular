// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium plant <brief>` — read a business-requirements brief and let the
// Claude Agent SDK scaffold the organism: mycelium.yaml, hyphae/HYPHA-*.md,
// CLAUDE.md, NUTRIENTS.md, and one agent stub per identified domain.

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  getStack,
  STACKS,
  renderContractAppendix,
} from "../stacks/index.js";
import { readMaxBudgetUsd } from "../lib/budget.js";
import {
  SECURITY_TIERS,
  isSecurityTier,
  type SecurityTier,
} from "../security/types.js";

export function registerPlantCommand(program: Command): void {
  program
    .command("plant <brief>")
    .description(
      "🌰 Plant an organism from a business brief — the SDK decomposes it into HYPHAE"
    )
    .option(
      "-s, --stack <name>",
      `Stack preset (${Object.keys(STACKS).join(", ")})`
    )
    .option(
      "-S, --security <tier>",
      "Security tier (demo, startup, regulated). REQUIRED on first plant of an organism; reads from mycelium.yaml on subsequent plants."
    )
    .option("-n, --name <name>", "Organism name (defaults to brief filename)")
    .option(
      "-d, --dir <dir>",
      "Target directory",
      process.cwd()
    )
    .option("--dry-run", "Print the planner prompt without invoking the SDK", false)
    .action(async (briefPath: string, opts) => {
      const briefAbs = path.resolve(briefPath);
      if (!fs.existsSync(briefAbs)) {
        console.log(chalk.red(`  ❌ Brief not found: ${briefAbs}`));
        process.exit(1);
      }

      const brief = fs.readFileSync(briefAbs, "utf-8");
      const targetDir = path.resolve(opts.dir);
      const organismName =
        opts.name ?? path.basename(briefAbs, path.extname(briefAbs));

      if (!opts.stack) {
        console.log(
          chalk.red("  ❌ --stack is required. Available: ") +
            chalk.cyan(Object.keys(STACKS).join(", "))
        );
        console.log(
          chalk.gray(
            "     Stack determines the contract baseline the planner injects"
          )
        );
        console.log(
          chalk.gray(
            "     into NUTRIENTS.md. Without a stack, contracts cannot be"
          )
        );
        console.log(
          chalk.gray(
            "     hardened against drift, and parallel leaves drift apart."
          )
        );
        process.exit(1);
      }

      const stack = getStack(opts.stack);
      if (!stack) {
        console.log(
          chalk.red(`  ❌ Unknown stack "${opts.stack}". Available: `) +
            chalk.cyan(Object.keys(STACKS).join(", "))
        );
        process.exit(1);
      }

      // Resolve security tier: read from existing yaml if present, else require --security flag.
      const yamlPath = path.join(targetDir, "mycelium.yaml");
      const existingTier: string | undefined = (() => {
        if (!fs.existsSync(yamlPath)) return undefined;
        try {
          const cfg = YAML.parse(fs.readFileSync(yamlPath, "utf-8"));
          return cfg?.organism?.security_tier;
        } catch {
          return undefined;
        }
      })();

      let securityTier: SecurityTier;
      if (opts.security) {
        if (!isSecurityTier(opts.security)) {
          console.log(
            chalk.red(`  ❌ Invalid --security tier "${opts.security}". Available: `) +
              chalk.cyan(SECURITY_TIERS.join(", "))
          );
          process.exit(1);
        }
        if (existingTier && existingTier !== opts.security) {
          console.log(
            chalk.red(
              `  ❌ Tier flip via plant is not supported (current: ${existingTier}, requested: ${opts.security}).`
            )
          );
          console.log(
            chalk.gray(
              `     Use \`mycelium contracts upgrade-tier ${opts.security}\` instead — it's faster and doesn't re-invoke the planner LLM.`
            )
          );
          process.exit(1);
        }
        securityTier = opts.security;
      } else if (existingTier && isSecurityTier(existingTier)) {
        securityTier = existingTier;
      } else {
        console.log(
          chalk.red("  ❌ --security is required on first plant. Available: ") +
            chalk.cyan(SECURITY_TIERS.join(", "))
        );
        console.log(
          chalk.gray(
            "     Tier sets the security contract enforcement strictness. Forgetting it"
          )
        );
        console.log(
          chalk.gray(
            "     would default the cultivation to weakest protection — explicit choice required."
          )
        );
        process.exit(1);
      }

      console.log();
      console.log(
        chalk.magentaBright.bold("  🌰 Planting organism ") +
          chalk.white.bold(organismName)
      );
      console.log(
        chalk.gray("  Brief:  ") + chalk.yellow(briefAbs)
      );
      console.log(
        chalk.gray("  Target: ") + chalk.yellow(targetDir)
      );
      console.log(
        chalk.gray("  Stack:  ") +
          chalk.cyan(stack?.name ?? "infer from brief")
      );
      console.log();

      const prompt = buildPlannerPrompt({
        brief,
        organismName,
        targetDir,
        stack,
        securityTier,
      });

      if (opts.dryRun) {
        console.log(chalk.gray("── Planner prompt ──"));
        console.log(prompt);
        return;
      }

      fs.mkdirSync(path.join(targetDir, "hyphae"), { recursive: true });
      fs.mkdirSync(path.join(targetDir, "agents"), { recursive: true });
      fs.mkdirSync(path.join(targetDir, "contracts"), { recursive: true });

      const spinner = ora({
        text: chalk.cyan("Sub-agent decomposing brief into HYPHAE..."),
        spinner: "earth",
      }).start();

      const maxBudgetUsd = readMaxBudgetUsd();
      try {
        const result = query({
          prompt,
          options: {
            cwd: targetDir,
            allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            permissionMode: "acceptEdits",
            ...(maxBudgetUsd !== undefined ? { maxBudgetUsd } : {}),
          },
        });

        let lastText = "";
        let budgetExceeded: { spent: number } | null = null;
        for await (const msg of result) {
          if (msg.type === "assistant") {
            const blocks = (msg as any).message?.content ?? [];
            for (const b of blocks) {
              if (b.type === "tool_use") {
                spinner.text = chalk.cyan(
                  `Sub-agent: ${chalk.white(b.name)} ${chalk.gray(
                    summarizeToolInput(b.name, b.input)
                  )}`
                );
              } else if (b.type === "text" && b.text) {
                lastText = b.text;
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
          spinner.fail(
            chalk.red(
              `BUDGET_EXCEEDED — stopped at $${budgetExceeded.spent.toFixed(4)} (cap $${(maxBudgetUsd ?? 0).toFixed(4)})`
            )
          );
          process.exit(1);
        }

        spinner.succeed(chalk.greenBright("Organism planted!"));

        if (lastText) {
          console.log();
          console.log(chalk.gray("  ── Planner summary ──"));
          console.log(
            lastText
              .split("\n")
              .map((l) => chalk.gray("  ") + l)
              .join("\n")
          );
        }

        console.log();
        console.log(chalk.green("  Next steps:"));
        console.log(
          chalk.gray("    1. ") +
            chalk.white("Review ") +
            chalk.yellow("mycelium.yaml") +
            chalk.white(" and ") +
            chalk.yellow("hyphae/")
        );
        console.log(
          chalk.gray("    2. ") +
            chalk.white("Adjust contracts in ") +
            chalk.yellow("NUTRIENTS.md")
        );
        console.log(
          chalk.gray("    3. ") +
            chalk.cyan("mycelium cultivate") +
            chalk.white(" to wake the organism")
        );
        console.log();
      } catch (err: any) {
        spinner.fail(chalk.red("Planner failed"));
        console.log(chalk.red(err?.message ?? String(err)));
        process.exit(1);
      }
    });
}

function summarizeToolInput(name: string, input: any): string {
  if (!input) return "";
  if (name === "Write" || name === "Edit" || name === "Read") {
    return input.file_path ?? "";
  }
  if (name === "Bash") {
    return (input.command ?? "").split("\n")[0].slice(0, 60);
  }
  return "";
}

function buildPlannerPrompt(args: {
  brief: string;
  organismName: string;
  targetDir: string;
  stack: NonNullable<ReturnType<typeof getStack>>;
  securityTier: SecurityTier;
}): string {
  const { brief, organismName, stack, securityTier } = args;

  const stackBlock = `STACK PRESET: ${stack.name}
${stack.description}

CLAUDE.md stack section to use verbatim:
${stack.claudeMdHeader}

Project rules to embed in CLAUDE.md:
${stack.rules}

REQUIRED agents (you MUST create agents with these exact ids — they own the
contract baseline declared in the verbatim contract appendix below):
${stack.requiredAgents.map((a) => `  - ${a}`).join("\n")}

Additional archetype agents (use those that fit the brief; rename freely;
extend with brief-specific agents as needed):
${stack.archetypeAgents
  .filter((a) => !stack.requiredAgents.includes(a))
  .map((a) => `  - ${a}`)
  .join("\n")}
`;

  const renderedAppendix = renderContractAppendix(stack.contractAppendix);

  return `You are the Mycelium planner sub-agent. You have been given a business brief
and must scaffold a complete Mycelium organism in the current working directory.

ORGANISM NAME: ${organismName}

${stackBlock}

BUSINESS BRIEF:
\`\`\`
${brief}
\`\`\`

Your job — produce these files using the Write tool:

1. **CLAUDE.md** — project context. Include: what this is (1-paragraph summary
   from the brief), the Stack section, the Stream tag convention
   (\`MF/DOMAIN: description\`), an "Active HYPHA" line pointing at
   \`hyphae/HYPHA-{DOMAIN}.md\`, a Contracts line pointing at \`NUTRIENTS.md\`,
   and a Rules section.

2. **mycelium.yaml** — organism config matching this shape:
   \`\`\`yaml
   organism:
     name: ${organismName}
     stack: ${stack.name}        # REQUIRED — audit/freeze look up the stack preset to verify contracts
     security_tier: ${securityTier}    # REQUIRED — audit/freeze/upgrade-tier read this
     ship_target: "<your estimate>"
     health_pulse_interval: 30
     harvest_threshold: 0.8
   contracts: []
   agents:
     - id: <kebab-case-id>
       scope: "<one-line responsibility>"
       branch: feat/<id>
       blocked_by: [<other agent ids>]
       blocks: [<other agent ids>]
       capabilities: [<tech tags>]
   merge_order: [<ordered list of agent ids>]
   \`\`\`
   The \`stack:\` field MUST be \`${stack.name}\` and \`security_tier:\` MUST be
   \`${securityTier}\` (downstream commands — audit, freeze, upgrade-tier — look
   them up). Section H of NUTRIENTS will be rendered with rules tagged
   at-tier-or-below + always-block rules active.
   Every required agent (listed above) MUST appear in this file. Decompose the
   brief into the required agents plus any additional brief-specific agents
   (typical total: 5-10). Wire blocked_by/blocks so the dependency graph is
   acyclic and matches real build order.

3. **hyphae/HYPHA-{DOMAIN}.md** — one file per agent, where {DOMAIN} matches
   the agent id in upper-snake-case. Each HYPHA file must include:
   - Goal (1-2 sentences)
   - Scope (in / out)
   - Inputs (contracts + upstream agents it depends on)
   - **Outputs (deliverables)** — list EVERY file the biome will produce, by
     full path (e.g., \`src/screens/auth/WelcomeScreen.tsx\`). The audit reads
     this list and verifies each file exists on disk after cultivation. A
     biome that lists a file in Outputs but doesn't ship it FAILS the audit.
   - Acceptance criteria (bulleted, testable)
   - Notes (anything specific from the brief)

   Critically: every screen referenced in the route map (Section E of the
   contract appendix in NUTRIENTS) MUST be claimed as a deliverable by some
   biome's HYPHA Outputs section. Cross-reference the screen ownership matrix
   in Section G — every row's "Screen file path" must appear in exactly one
   biome's HYPHA Outputs.

4. **NUTRIENTS.md** — frozen contracts. STRICT RULES:
   - NO \`#TODO\`. NO placeholders. NO "fill in later". Every field, every
     row, every value is concrete.
   - The first part of NUTRIENTS.md is a CONTRACT APPENDIX section copied
     VERBATIM from the stack preset (see VERBATIM CONTRACT APPENDIX block
     near the end of this prompt). Copy that block byte-for-byte. Do not
     paraphrase. Do not omit subsections. Do not reorder.
   - After the verbatim appendix, add the organism-specific extensions:

     **DATA_CONTRACTS** — full TypeScript interfaces for every domain entity
     in the brief. Every field has a concrete type. If a field's type is
     genuinely ambiguous from the brief, infer from the strongest signal and
     add a single-line comment explaining the inference. NEVER \`any\` or
     \`unknown\`.

     **Section C extension rows** — append to the Symbol Ownership Matrix
     (from the verbatim appendix) one row for every: domain entity type,
     domain enum, biome-level component, hook, context, and lib utility the
     brief implies. Owner must be one of the agents you created. Path
     conventions follow §D in the appendix. NO symbol claimed by two agents.

     **Section E extension rows** — append to Allow-listed Identifiers:
       - Domain enums: full TS union types for every enum in the brief
         (categories, statuses, roles, types) owned by the schema-core /
         types-owning agent.
       - Route map: complete \`RootStackParamList\` (or stack equivalent) with
         every screen, sub-screen, and modal in the brief, typed.
       - BrandIcon name union: narrow \`BrandIconProps['name']\` to the
         specific brand glyphs the brief uses (Spotify, Google, etc.).

     **Section G extension — Screen Ownership Matrix table** — for EVERY
     route in §E's route map, append a row to the table in §G with:
       - Route name (matches the route map literal)
       - Owner biome (must exist in mycelium.yaml AND must claim the file as
         a deliverable in its HYPHA Outputs)
       - Screen file path (e.g., \`src/screens/auth/WelcomeScreen.tsx\`)
       - Import statement app-shell will use in \`RootNavigator.tsx\`

     The table is load-bearing — app-shell's RootNavigator MUST import each
     screen at the listed path. PlaceholderScreen-returns-null is FORBIDDEN
     (rule §F.9). If the owning biome hasn't shipped the screen yet at
     cultivation time, the placeholder MUST render the route name visibly
     (see §F.9 for the pattern).

     **DESIGN_TOKENS** — actual token values: colors (with hex), typography
     scale, spacing scale, radii, shadows, motion durations. Source from the
     brief if present; otherwise synthesize a coherent palette aligned with
     the brand. NO placeholders. The design-system agent must be able to
     ship \`tokens.ts\` directly from this section.

     **API_CONTRACTS** — one block per endpoint with full request/response
     shapes as TS interfaces. NO \`METHOD path → shape\` shorthand.

5. **agents/{id}.ts** — for each agent, write a stub matching this shape
   (id, scope, branch, blocked_by, blocks, capabilities + germinate/grow/fruit
   methods that just log). Match what \`mycelium agent create\` would produce.

6. **CELLULAR-MAP.md** — the max-concurrency execution tree for this organism.
   This file is the operator's at-a-glance view of how deep the decomposition
   goes and how many parallel Claude Agent SDK sessions the organism can fan
   out to at peak. Required sections, in this order:

   - **Heading** \`# {Organism Name} Cellular Execution Map\`
   - **Blockquote** restating the gating model: max-concurrency tree, gating =
     **contract freeze** (not fruit completion), every leaf is its own Claude
     Agent SDK session on its own branch.
   - **Concurrency math** table with columns \`Depth | Count\`:
       \`Biomes (1)\` = number of top-level agents,
       \`Specialists (2)\` = estimated count after one decomposition pass,
       \`Leaf specialists (3)\` = target count once fully decomposed,
       \`Total concurrent sessions at peak\` = realistic peak estimate now and
       a target for full depth-3 rollout.
   - **Gating semantics** paragraph: contrast old wave-gating vs. new
     contract-freeze gating (specialists consume frozen contract stubs, not
     upstream code; integration happens at merge time via deterministic merge
     order, not execution time).
   - **Tree** fenced code block rendering every agent → specialist → leaf in
     the shape:
     \`\`\`
     organism: {name}
     │
     ├── {agent-id} ({specialist count})
     │   ├── {agent-id}.{specialist-slug}
     │   │   ├── {agent-id}.{specialist-slug}.{leaf-slug}
     ...
     \`\`\`
     For agents where leaf decomposition is not yet planned, emit the agent
     with a \`— flat; leaf decomposition TODO\` tag so gaps are visible.
   - **What's next** numbered list — concrete next leaf-decomposition passes
     to increase peak concurrency, each with an estimated session delta.
   - **Parked for later** short list of intentionally deferred concerns
     (rate-limit tuning, circuit breakers, etc.).

   The map MUST be organism-agnostic in tone — no product-specific jargon
   outside agent/specialist/leaf ids. It is the generic ideology applied to
   this organism's specific decomposition.

After writing all files, output a short markdown summary listing what you
created and any open questions the user should resolve before running
\`mycelium contracts audit\` and then \`mycelium contracts freeze\`.

Do NOT install dependencies, run builds, or commit. Just write the files.

─────────────────────────────────────────────────────────────────────────
VERBATIM CONTRACT APPENDIX
Copy the entire block between the START and END markers below into
NUTRIENTS.md as-is. Do not modify, paraphrase, or omit any part. After
this block ends in NUTRIENTS.md, append the organism-specific extensions
described in step 4 above.
─────────────────────────────────────────────────────────────────────────
START VERBATIM CONTRACT APPENDIX

${renderedAppendix}

END VERBATIM CONTRACT APPENDIX
─────────────────────────────────────────────────────────────────────────`;
}
