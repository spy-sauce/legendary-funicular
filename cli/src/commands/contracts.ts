// Mycelium Framework — VibeSpace LLC — The network provides.

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readMaxBudgetUsd } from "../lib/budget.js";
import { getStack, STACKS, renderContractAppendix } from "../stacks/index.js";

interface ContractEntry {
  path?: string;
  frozen?: boolean;
  frozenAt?: string;
}

interface AuditResult {
  passed: boolean;
  exitCode: number;
  summary: string;
}

export function registerContractsCommand(program: Command): void {
  const contracts = program
    .command("contracts")
    .description("📜 Manage shared type contracts across the organism");

  contracts
    .command("audit")
    .description(
      "🔬 Verify NUTRIENTS.md matches the stack's contract appendix — runs before freeze"
    )
    .option(
      "--fix",
      "Patch NUTRIENTS.md by copying missing subsections verbatim from the stack appendix (default: report-only)",
      false
    )
    .option(
      "-s, --stack <name>",
      `Stack preset (overrides mycelium.yaml; ${Object.keys(STACKS).join(", ")})`
    )
    .action(async (opts: { fix: boolean; stack?: string }) => {
      const result = await runAudit({
        cwd: process.cwd(),
        fix: opts.fix,
        stackOverride: opts.stack,
      });
      process.exit(result.exitCode);
    });

  contracts
    .command("freeze")
    .description(
      "Freeze all contracts — lock the shared types so agents build on stable ground"
    )
    .option(
      "--skip-audit",
      "Skip the contract audit gate (NOT recommended — only for emergencies)",
      false
    )
    .action(async (opts: { skipAudit: boolean }) => {
      if (!opts.skipAudit) {
        console.log(
          chalk.gray(
            "  Running contract audit before freeze (use --skip-audit to bypass)..."
          )
        );
        console.log();
        const audit = await runAudit({
          cwd: process.cwd(),
          fix: false,
        });
        if (!audit.passed) {
          console.log();
          console.log(
            chalk.red(
              "  ❌ Audit failed — refusing to freeze. Resolve gaps and rerun."
            )
          );
          console.log(
            chalk.gray(
              "     Hint: `mycelium contracts audit --fix` patches verbatim drift."
            )
          );
          console.log(
            chalk.gray(
              "     Hint: `mycelium contracts freeze --skip-audit` bypasses (emergency only)."
            )
          );
          process.exit(audit.exitCode);
        }
        console.log();
      } else {
        console.log(
          chalk.yellow("  ⚠️  --skip-audit: bypassing contract audit gate.")
        );
        console.log();
      }

      const configPath = path.join(process.cwd(), "mycelium.yaml");
      if (!fs.existsSync(configPath)) {
        console.log(
          chalk.red("  ❌ No mycelium.yaml found. Run ") +
            chalk.cyan("mycelium init") +
            chalk.red(" first.")
        );
        return;
      }

      const spinner = ora({
        text: chalk.cyan("Crystallizing contracts..."),
        spinner: "dots",
      }).start();

      const raw = fs.readFileSync(configPath, "utf-8");
      const config = YAML.parse(raw);
      let contractsList: (string | ContractEntry)[] = config.contracts || [];

      // Auto-target NUTRIENTS.md if the contracts list is empty and the file
      // exists. The new framework treats NUTRIENTS.md itself as the contract
      // surface, so an empty list at freeze time means the user wants the
      // standard target. (Skip auto-add if the user explicitly wants no
      // contracts — that case results in no NUTRIENTS.md file.)
      const nutrientsExists = fs.existsSync(
        path.join(process.cwd(), "NUTRIENTS.md")
      );
      if (contractsList.length === 0 && nutrientsExists) {
        contractsList = ["NUTRIENTS.md"];
        spinner.text = chalk.cyan(
          "Empty contracts list — auto-targeting NUTRIENTS.md..."
        );
      } else if (contractsList.length === 0) {
        spinner.warn(
          chalk.yellow(
            "No contracts in mycelium.yaml and no NUTRIENTS.md found. Nothing to freeze."
          )
        );
        return;
      }

      const now = new Date().toISOString();

      // Transform contracts into frozen form
      config.contracts = contractsList.map(
        (c: string | ContractEntry) => {
          const contractPath = typeof c === "string" ? c : c.path;
          return {
            path: contractPath,
            frozen: true,
            frozenAt: now,
          };
        }
      );

      const updatedYaml =
        "# Mycelium Framework — VibeSpace LLC — The network provides.\n\n" +
        YAML.stringify(config);
      fs.writeFileSync(configPath, updatedYaml, "utf-8");

      spinner.succeed(
        chalk.greenBright("All contracts frozen!")
      );

      console.log();
      console.log(
        chalk.magentaBright("  🧊 Contract Freeze Report")
      );
      console.log(
        chalk.gray(`  ── Frozen at: ${chalk.white(now)}`)
      );
      console.log();

      for (const c of config.contracts) {
        console.log(
          chalk.gray("    🔒 ") +
            chalk.yellow(c.path) +
            chalk.green(" — frozen")
        );
      }

      console.log();
      console.log(
        chalk.gray.italic(
          "  The contracts are crystallized. Agents may now grow with certainty. 🧊"
        )
      );
    });

  contracts
    .command("list")
    .description("Show all contracts and their freeze state")
    .action(async () => {
      const configPath = path.join(process.cwd(), "mycelium.yaml");
      if (!fs.existsSync(configPath)) {
        console.log(
          chalk.red("  ❌ No mycelium.yaml found. Run ") +
            chalk.cyan("mycelium init") +
            chalk.red(" first.")
        );
        return;
      }

      const raw = fs.readFileSync(configPath, "utf-8");
      const config = YAML.parse(raw);
      const contractsList: (string | ContractEntry)[] =
        config.contracts || [];

      if (contractsList.length === 0) {
        console.log(
          chalk.yellow("  📭 No contracts defined in mycelium.yaml")
        );
        return;
      }

      console.log(chalk.magentaBright("  📜 Contracts:\n"));

      for (const c of contractsList) {
        if (typeof c === "string") {
          console.log(
            chalk.gray("    📄 ") +
              chalk.yellow(c) +
              chalk.gray(" — ") +
              chalk.red("unfrozen")
          );
        } else {
          const status = c.frozen
            ? chalk.green("frozen") +
              chalk.gray(` (${c.frozenAt})`)
            : chalk.red("unfrozen");
          console.log(
            chalk.gray("    📄 ") +
              chalk.yellow(c.path || "unknown") +
              chalk.gray(" — ") +
              status
          );
        }
      }

      console.log();
    });
}

async function runAudit(args: {
  cwd: string;
  fix: boolean;
  stackOverride?: string;
}): Promise<AuditResult> {
  const { cwd, fix, stackOverride } = args;
  const nutrientsPath = path.join(cwd, "NUTRIENTS.md");
  const myceliumYamlPath = path.join(cwd, "mycelium.yaml");

  if (!fs.existsSync(myceliumYamlPath)) {
    console.log(
      chalk.red(
        "  ❌ mycelium.yaml not found. Run `mycelium plant <brief> --stack <name>` first."
      )
    );
    return { passed: false, exitCode: 2, summary: "yaml missing" };
  }
  if (!fs.existsSync(nutrientsPath)) {
    console.log(
      chalk.red(
        "  ❌ NUTRIENTS.md not found. Run `mycelium plant <brief> --stack <name>` first."
      )
    );
    return { passed: false, exitCode: 2, summary: "nutrients missing" };
  }

  // Resolve stack: --stack flag wins; otherwise read from mycelium.yaml
  let stackName = stackOverride;
  if (!stackName) {
    try {
      const yamlRaw = fs.readFileSync(myceliumYamlPath, "utf-8");
      const yamlConfig = YAML.parse(yamlRaw);
      stackName = yamlConfig?.organism?.stack;
    } catch {
      // fall through; handled below
    }
  }
  if (!stackName) {
    console.log(
      chalk.red(
        "  ❌ No stack recorded in mycelium.yaml.organism.stack and no --stack flag."
      )
    );
    console.log(
      chalk.gray(
        `     Pass --stack <name> (${Object.keys(STACKS).join(", ")}) or re-plant.`
      )
    );
    console.log(
      chalk.gray(
        "     Older organisms planted before the stack-recording change need either."
      )
    );
    return { passed: false, exitCode: 2, summary: "no stack" };
  }
  const stack = getStack(stackName);
  if (!stack) {
    console.log(
      chalk.red(
        `  ❌ Unknown stack "${stackName}". Available: ${Object.keys(STACKS).join(", ")}`
      )
    );
    return { passed: false, exitCode: 2, summary: "unknown stack" };
  }

  const renderedAppendix = renderContractAppendix(stack.contractAppendix);

  const spinner = ora({
    text: chalk.cyan(
      fix
        ? `Auditing & patching against ${stack.name}...`
        : `Auditing against ${stack.name} (read-only)...`
    ),
    spinner: "dots",
  }).start();

  const prompt = buildAuditPrompt({
    fix,
    nutrientsPath,
    cwd,
    stackName: stack.name,
    renderedAppendix,
  });
  const allowedTools = fix
    ? ["Read", "Write", "Edit", "Glob", "Grep", "Bash"]
    : ["Read", "Glob", "Grep", "Bash"];
  const maxBudgetUsd = readMaxBudgetUsd();

  let lastText = "";
  try {
    const result = query({
      prompt,
      options: {
        cwd,
        allowedTools,
        permissionMode: fix ? "acceptEdits" : "default",
        ...(maxBudgetUsd !== undefined ? { maxBudgetUsd } : {}),
      },
    });

    for await (const msg of result) {
      if (msg.type === "assistant") {
        const blocks = (msg as any).message?.content ?? [];
        for (const b of blocks) {
          if (b.type === "tool_use") {
            spinner.text = chalk.cyan(
              `Auditor: ${chalk.white(b.name)}`
            );
          } else if (b.type === "text" && b.text) {
            lastText = b.text;
          }
        }
      }
    }
  } catch (err: any) {
    spinner.fail(chalk.red("Auditor failed"));
    console.log(chalk.red(err?.message ?? String(err)));
    return { passed: false, exitCode: 3, summary: "auditor crash" };
  }

  // Marker is a discrete, last-line directive the auditor must emit.
  const passed = /AUDIT PASS\b/.test(lastText);
  const failed = /AUDIT FAIL\b/.test(lastText);

  if (passed && !failed) {
    spinner.succeed(chalk.greenBright("Audit passed"));
  } else if (failed) {
    spinner.fail(chalk.red("Audit failed"));
  } else {
    spinner.warn(
      chalk.yellow(
        "Audit returned no PASS/FAIL marker — treating as failure."
      )
    );
  }

  if (lastText) {
    console.log();
    console.log(chalk.gray("  ── Audit report ──"));
    console.log(
      lastText
        .split("\n")
        .map((l) => chalk.gray("  ") + l)
        .join("\n")
    );
  }

  return {
    passed: passed && !failed,
    exitCode: passed && !failed ? 0 : 1,
    summary: passed ? "pass" : failed ? "fail" : "no marker",
  };
}

function buildAuditPrompt(args: {
  fix: boolean;
  nutrientsPath: string;
  cwd: string;
  stackName: string;
  renderedAppendix: string;
}): string {
  const { fix, nutrientsPath, stackName, renderedAppendix } = args;

  const modeBlock = fix
    ? `MODE: AUTO-FIX. You may patch NUTRIENTS.md by copying missing subsections
verbatim from the SOURCE-OF-TRUTH APPENDIX block embedded below. Use
Edit/Write to apply patches. After patching, re-verify and report.`
    : `MODE: REPORT-ONLY. You MUST NOT write to any file. Read and report only.
If you find gaps, recommend running \`mycelium contracts audit --fix\`.`;

  return `You are the Mycelium contract auditor. Verify that NUTRIENTS.md matches
the contract appendix shipped by the stack preset, and that the surface is
complete enough to prevent the contract-drift class of failure (missing
deps, prop drift, inline style-array typing, icon-name drift, duplicate
barrel exports).

This audit runs between \`mycelium plant\` and \`mycelium contracts freeze\`.
The freeze command shells out to this audit and refuses on non-zero exit.

STACK: ${stackName}

The SOURCE-OF-TRUTH APPENDIX is embedded verbatim at the bottom of this
prompt (between START and END markers). It is what the planner SHOULD have
copied into NUTRIENTS.md when planting. Use that block as the reference,
not any text in brief.md.

${modeBlock}

# Inputs (read all before reporting)
- ${nutrientsPath} — target of audit
- ./mycelium.yaml — biome roster for completeness checks
- ./hyphae/HYPHA-*.md — cross-check: HYPHAs may not reference symbols
  absent from the ownership matrix
- ./CLAUDE.md — project rules

You do NOT need to read brief.md for the appendix — it is embedded below.
You MAY read brief.md if you need product context to evaluate organism-
specific extensions in §C and §E (entity types, route map, brand glyph
set), but the source of truth for sections A/B/D/F (and the universal
parts of C/E) is the embedded appendix.

# Audit procedure
For each appendix subsection (A–F), perform per-section checks, then
cross-section checks, then the failure-mode prevention re-verify.

## A. Dependency Manifest
- NUTRIENTS contains every package from appendix A.
- Each package has exactly one owner biome (from mycelium.yaml).
- Versions match.
${fix ? "Patch: copy missing rows verbatim from appendix A." : "If gaps: report; do not patch."}

## B. Component Prop Contracts
- Every TS interface from appendix B is present in NUTRIENTS.
- No prop renamed, removed, or retyped.
- Interfaces parse as valid TS.
${fix ? "Patch: replace the entire interface block byte-for-byte from appendix B (no merge)." : "If gaps: report; do not patch."}

## C. Symbol Ownership Matrix
- Table present.
- Every baseline row from appendix C is in NUTRIENTS.
- Each symbol has exactly one owner.
- Owner biomes exist in mycelium.yaml.
- No symbol claimed by two biomes.
${fix ? "Patch baseline rows: copy verbatim from appendix C." : "If gaps: report."}
DO NOT auto-fix conflicts (symbol owned by two biomes) — surface them as
human action items. The appendix and HYPHA files are authoritative; the
audit cannot adjudicate ownership.

## D. Barrel File Ownership
- Table present with every barrel from appendix D.
- One owner per barrel.
${fix ? "Patch: copy missing rows verbatim." : "If gaps: report."}

## E. Allow-listed Identifiers
- Ionicons type-level constraint present (not enum list).
- BrandIcon route-rule for brand glyphs present.
- Domain enums present with same union members as appendix.
- Route name conventions present.
${fix ? "Patch universal rules verbatim. Organism-specific rows stay as planner-generated." : "If gaps: report."}

## F. Style System Rules
- Every numbered rule from appendix F present in NUTRIENTS.
- Code examples (GOOD/BAD) present, not paraphrased.
${fix ? "Patch missing rules verbatim." : "If gaps: report."}

## G. Screen Ownership Matrix
- Universal wiring rules from appendix G present in NUTRIENTS.
- Per-route table present and covers EVERY route in §E's RootStackParamList
  (or stack equivalent). Count routes in §E and rows in §G; they must match.
- Each row's owner biome exists in mycelium.yaml.
- Each row's "Screen file path" is unique across the matrix (no two routes
  point at the same file).
- Each row's "Import statement" matches the file path (e.g., file path
  \`src/screens/auth/WelcomeScreen.tsx\` implies import from
  \`@/screens/auth/WelcomeScreen\`).
${fix ? "Patch missing rules verbatim. The per-route table is planner-generated; if rows are missing, flag as a planner gap (not auto-patchable)." : "If gaps: report."}

## Cross-section checks
- Every biome in mycelium.yaml owns at least one symbol in §C OR a barrel in §D OR a route in §G.
- Every primitive in §B has a row in §C and a barrel reference in §D.
- Every dep in §A is plausibly used by at least one HYPHA.
- Every route in §E's RootStackParamList has exactly one row in §G.

## HYPHA cross-check
For every hyphae/HYPHA-*.md:
- Imported TS symbols are owned by some biome in §C.
- Primitives rendered in code samples are in §B.
- Deps referenced are in §A.
- **Outputs (deliverables) section**: every file path listed there is also
  claimed in §C (for non-screen files) OR in §G's Screen Ownership Matrix
  (for screen files). No orphan deliverables.
If a HYPHA references a symbol not in §C, flag as HYPHA bug — DO NOT
silently add the symbol. The HYPHA must be amended OR the appendix
updated and the planner re-run.

## Deliverable existence check (post-cultivation only)
If \`./src\` exists (i.e., cultivation has run), additionally verify:
- Every "Screen file path" in §G has a real file on disk at that path.
- Every file listed in any HYPHA's Outputs section exists on disk.
- \`src/navigation/RootNavigator.tsx\` (or stack equivalent) imports each
  screen at the path listed in §G — NOT a stubbed PlaceholderScreen that
  returns null. Use Bash + grep to verify the imports exist.

If \`./src\` does NOT exist yet, skip this check (audit running pre-cultivate).

## Failure-mode prevention re-verify
Reproduce this table against NUTRIENTS specifically:

| # | Failure mode | NUTRIENTS section | Specific rule |
| 1 | Missing runtime deps | A | every dep has owner; +dep gate on FRUIT_READY |
| 2 | Component prop drift | B | frozen TS interfaces |
| 3 | Inline style-array typing | F | object-spread + ViewStyle/TextStyle separation |
| 4 | Icon name drift | E | type-constrained Ionicons + BrandIcon component |
| 5 | Duplicate barrel export | D | one owner per barrel |
| 6 | Black-screen boot (PlaceholderScreen) | G + F.9 | screen ownership matrix + RootNavigator imports real screens |
| 7 | Service client throws on missing env | F.7 | demo-stub fallback pattern |
| 8 | app.json phantom assets / EAS placeholder | F.8 | no asset refs unless files exist; no EAS placeholder |
| 9 | Wrong import subpath for common pkgs | F.10 | explicit canonical import paths |
| 10 | Biome ships HYPHA outputs without files | (deliverable check) | post-cultivation file existence |

# Output (single markdown report, in this order)

## 1. Summary
- Total checks: <n>
- Passed: <n>
- Patched: <n>  (auto-fixed by verbatim copy from appendix; --fix mode only)
- Failed: <n>   (require human action)

## 2. Patches applied
For each patched item: subsection, what was missing, what was copied in.
(Empty if --fix not in effect or no patches needed.)

## 3. Unresolved failures (block freeze)
For each: subsection, exact rule violated, suggested human action.
If none: "None. Ready for Patrick review → freeze."

## 4. Failure-mode prevention table
The 5-row table above, post-patch.

## 5. Patrick checklist
Short list of questions Patrick should answer in his contract review,
derived from anything patched or borderline.

# Final line — REQUIRED MARKER
Your VERY LAST line of output must be exactly one of:
- \`AUDIT PASS — Patrick review pending\`
- \`AUDIT FAIL — <n> unresolved gaps\`

Nothing after this line. The CLI greps for it to set its exit code.

# Rules
- VERBATIM PATCHING ONLY (sections A, B, D, E universal rules, F).
- NO ADJUDICATION for ownership conflicts in §C.
- NO SECRETS in any patch.
- DO NOT run \`mycelium contracts freeze\`. The auditor only writes to
  NUTRIENTS.md and the report. Freeze remains human-gated.
- If no patches were needed, NUTRIENTS.md is unchanged.
- The "appendix" referenced throughout this prompt means the embedded
  SOURCE-OF-TRUTH APPENDIX block below — NOT brief.md.

─────────────────────────────────────────────────────────────────────────
START SOURCE-OF-TRUTH APPENDIX (stack: ${stackName})

${renderedAppendix}

END SOURCE-OF-TRUTH APPENDIX
─────────────────────────────────────────────────────────────────────────`;
}
