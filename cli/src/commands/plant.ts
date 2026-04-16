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
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getStack, STACKS } from "../stacks/index.js";

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
      const stack = getStack(opts.stack);

      if (opts.stack && !stack) {
        console.log(
          chalk.red(`  ❌ Unknown stack "${opts.stack}". Available: `) +
            chalk.cyan(Object.keys(STACKS).join(", "))
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

      try {
        const result = query({
          prompt,
          options: {
            cwd: targetDir,
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
                  `Sub-agent: ${chalk.white(b.name)} ${chalk.gray(
                    summarizeToolInput(b.name, b.input)
                  )}`
                );
              } else if (b.type === "text" && b.text) {
                lastText = b.text;
              }
            }
          }
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
  stack: ReturnType<typeof getStack>;
}): string {
  const { brief, organismName, stack } = args;

  const stackBlock = stack
    ? `STACK PRESET: ${stack.name}
${stack.description}

CLAUDE.md stack section to use verbatim:
${stack.claudeMdHeader}

Project rules to embed in CLAUDE.md:
${stack.rules}

Suggested archetype agents (use only those that fit the brief; rename freely):
${stack.archetypeAgents.map((a) => `  - ${a}`).join("\n")}
`
    : `STACK: not specified — infer the smallest reasonable stack from the brief itself.`;

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
   Decompose the brief into 3-7 agents. Wire blocked_by/blocks so the
   dependency graph is acyclic and matches real build order.

3. **hyphae/HYPHA-{DOMAIN}.md** — one file per agent, where {DOMAIN} matches
   the agent id in upper-snake-case. Each HYPHA file must include:
   - Goal (1-2 sentences)
   - Scope (in / out)
   - Inputs (contracts + upstream agents it depends on)
   - Outputs (contracts + deliverables)
   - Acceptance criteria (bulleted, testable)
   - Notes (anything specific from the brief)

4. **NUTRIENTS.md** — frozen contracts doc. Sections:
   - DATA_CONTRACTS (TypeScript-style interface stubs for the main entities
     in the brief — leave fields TODO if unclear)
   - DESIGN_TOKENS (colors, typography, spacing — placeholders OK)
   - API_CONTRACTS (one line per endpoint: METHOD path → response shape)

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
\`mycelium cultivate\`.

Do NOT install dependencies, run builds, or commit. Just write the files.`;
}
