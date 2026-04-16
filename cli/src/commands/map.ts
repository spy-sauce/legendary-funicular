// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium map` — read an existing organism's mycelium.yaml + repo state and
// generate (or refresh) CELLULAR-MAP.md. This is the "here's where we're at"
// path: you point it at a directory that already has mycelium.yaml and it
// produces the max-concurrency execution tree for the current decomposition.

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

export function registerMapCommand(program: Command): void {
  program
    .command("map")
    .description(
      "🗺️  Generate or refresh CELLULAR-MAP.md from the organism's current state"
    )
    .option(
      "-d, --dir <dir>",
      "Organism directory (must contain mycelium.yaml)",
      process.cwd()
    )
    .option(
      "-o, --out <file>",
      "Output filename",
      "CELLULAR-MAP.md"
    )
    .option(
      "--dry-run",
      "Print the planner prompt without invoking the SDK",
      false
    )
    .action(async (opts) => {
      const targetDir = path.resolve(opts.dir);
      const myceliumYamlPath = path.join(targetDir, "mycelium.yaml");

      if (!fs.existsSync(myceliumYamlPath)) {
        console.log(
          chalk.red(`  ❌ mycelium.yaml not found at ${myceliumYamlPath}`)
        );
        console.log(
          chalk.gray(
            `     Run \`mycelium plant <brief>\` first, or pass --dir.`
          )
        );
        process.exit(1);
      }

      const myceliumYaml = fs.readFileSync(myceliumYamlPath, "utf-8");
      const hyphaeDir = path.join(targetDir, "hyphae");
      const hyphaeIndex = fs.existsSync(hyphaeDir)
        ? fs
            .readdirSync(hyphaeDir)
            .filter((f) => f.startsWith("HYPHA-") && f.endsWith(".md"))
            .map((f) => `  - hyphae/${f}`)
            .join("\n")
        : "  (no hyphae/ directory yet)";

      const outPath = path.join(targetDir, opts.out);
      const exists = fs.existsSync(outPath);

      console.log();
      console.log(
        chalk.magentaBright.bold("  🗺️  Mapping organism ") +
          chalk.white.bold(path.basename(targetDir))
      );
      console.log(chalk.gray("  Config: ") + chalk.yellow(myceliumYamlPath));
      console.log(
        chalk.gray("  Output: ") +
          chalk.yellow(outPath) +
          chalk.gray(exists ? "  (will refresh)" : "  (new)")
      );
      console.log();

      const prompt = buildMapPrompt({
        myceliumYaml,
        hyphaeIndex,
        outFilename: opts.out,
      });

      if (opts.dryRun) {
        console.log(chalk.gray("── Map prompt ──"));
        console.log(prompt);
        return;
      }

      const spinner = ora({
        text: chalk.cyan("Generating cellular execution map..."),
        spinner: "earth",
      }).start();

      try {
        const result = query({
          prompt,
          options: {
            cwd: targetDir,
            allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
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
                  `Mapping: ${chalk.white(b.name)} ${chalk.gray(
                    summarizeToolInput(b.name, b.input)
                  )}`
                );
              } else if (b.type === "text" && b.text) {
                lastText = b.text;
              }
            }
          }
        }

        spinner.succeed(chalk.greenBright("Cellular map ready!"));

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
      } catch (err: any) {
        spinner.fail(chalk.red("Map generation failed"));
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
  return "";
}

function buildMapPrompt(args: {
  myceliumYaml: string;
  hyphaeIndex: string;
  outFilename: string;
}): string {
  const { myceliumYaml, hyphaeIndex, outFilename } = args;

  return `You are the Mycelium map sub-agent. You produce the canonical
CELLULAR-MAP.md for an existing organism.

Inputs available:

mycelium.yaml:
\`\`\`yaml
${myceliumYaml}
\`\`\`

Hyphae on disk:
${hyphaeIndex}

You MAY read any HYPHA-*.md file in hyphae/ to understand per-agent
decomposition. You MAY read CLAUDE.md and NUTRIENTS.md if they exist for
additional context. Do not read source code.

Write the file \`${outFilename}\` with this exact structure:

1. \`# {Organism Name} Cellular Execution Map\` (derive the name from
   organism.name in mycelium.yaml, Title-Cased).

2. A blockquote restating the gating model verbatim:

   > Max-concurrency tree. Gating = **contract freeze**, not fruit completion.
   > Every leaf is a Claude Agent SDK session on its own branch.

3. \`## Concurrency math\` — a markdown table with columns \`Depth | Count\`:
     - \`Biomes (1)\` — count of top-level entries in \`agents:\`.
     - \`Specialists (2)\` — best-effort count from HYPHA files or stated
       sub-decomposition; if unknown, use \`TBD\`.
     - \`Leaf specialists (3)\` — target count after full depth-3 rollout; if
       unknown, use \`TBD (target 3-5x specialist count)\`.
     - \`**Total concurrent sessions at peak**\` — a realistic current estimate
       and a target, formatted like \`~N now, target M once full depth-3 rollout\`.

4. \`## Gating semantics\` — exactly two paragraphs:
   - **Old (wave)**: the dependency-graph model where downstream agents wait
     for upstream FRUIT_READY.
   - **New (contract-freeze)**: the moment \`NUTRIENTS.md\` freezes, every
     dish can begin; specialists consume frozen contract stubs (type
     signatures + mock payloads), not upstream code; integration happens at
     merge time via the deterministic merge order, not execution time. This
     is what unlocks the full parallel tree.

5. \`## Tree\` — a fenced code block using box-drawing characters:

   \`\`\`
   organism: {name}
   │
   ├── {agent-id} ({specialist count or "flat"})
   │   ├── {agent-id}.{specialist-slug}
   │   │   ├── {agent-id}.{specialist-slug}.{leaf-slug}
   ...
   \`\`\`

   For agents with no documented sub-decomposition, emit the agent line with
   a trailing \`— flat; leaf decomposition TODO\` so gaps are visible.

6. \`## What's next (to hit full depth-3)\` — a numbered list of the concrete
   leaf-decomposition passes still needed, each with an estimated session
   delta (e.g., "Adds ~20-30 concurrent sessions").

7. \`## Parked for later\` — a short bulleted list of deferred concerns
   (rate-limit tuning, circuit breakers, cost optimization). Use sensible
   defaults if none are stated in the inputs.

Tone: organism-agnostic. The only product-specific strings allowed are the
agent/specialist/leaf ids and the organism name. Everything else is the
generic ideology applied to this organism.

After writing the file, output a one-paragraph summary of the current depth,
peak concurrency, and the single highest-leverage next decomposition pass.
Do not install dependencies, run builds, or commit.`;
}
