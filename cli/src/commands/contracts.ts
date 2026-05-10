// Mycelium Framework — VibeSpace LLC — The network provides.

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readMaxBudgetUsd } from "../lib/budget.js";
import { getStack, STACKS, renderContractAppendix } from "../stacks/index.js";
import "../security/scanners.js"; // side-effect: registers all scanners
import { SCANNER_REGISTRY } from "../security/registry.js";
import {
  type Finding,
  type SecurityTier,
  type SecurityAllowlistEntry,
  isSecurityTier,
  TIER_RANK,
} from "../security/types.js";

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
    .command("upgrade-tier <new-tier>")
    .description(
      "🔼 Promote security tier (demo → startup → regulated). Rewrites mycelium.yaml + re-renders §H of NUTRIENTS."
    )
    .action(async (newTierRaw: string) => {
      await runUpgradeTier(process.cwd(), newTierRaw);
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

/**
 * Walk git log for mycelium.yaml; find the highest organism.security_tier
 * ever recorded in committed history. Returns null if not in a git repo or
 * if no prior tier values are found.
 */
function findPriorSecurityTier(cwd: string): SecurityTier | null {
  try {
    const log = execFileSync(
      "git",
      ["log", "--pretty=format:%H", "--", "mycelium.yaml"],
      {
        cwd,
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024,
      }
    );
    const shas = log.split("\n").filter((l) => l.length > 0);
    let highest: SecurityTier | null = null;
    for (const sha of shas) {
      try {
        const content = execFileSync(
          "git",
          ["show", `${sha}:mycelium.yaml`],
          { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
        );
        const cfg = YAML.parse(content);
        const tier = cfg?.organism?.security_tier;
        if (isSecurityTier(tier)) {
          if (!highest || TIER_RANK[tier] > TIER_RANK[highest]) {
            highest = tier;
          }
        }
      } catch {
        continue;
      }
    }
    return highest;
  } catch {
    return null;
  }
}

async function runAllScanners(cwd: string): Promise<Finding[]> {
  const all: Finding[] = [];
  for (const [ruleId, scanner] of Object.entries(SCANNER_REGISTRY)) {
    try {
      const findings = await scanner(cwd);
      all.push(...findings);
    } catch (err: any) {
      console.error(
        chalk.yellow(`  ⚠️  scanner ${ruleId} crashed: ${err?.message ?? err}`)
      );
    }
  }
  return all;
}

/** True when current date is on or before expires (YYYY-MM-DD). */
function allowlistActive(entry: SecurityAllowlistEntry): boolean {
  return new Date().toISOString().slice(0, 10) <= entry.expires;
}

function micromatchSafe(file: string, pattern: string): boolean {
  // Lightweight glob: ** matches any segments; * matches one segment.
  // Sufficient for v1; replace with `micromatch` if needed.
  const re = new RegExp(
    "^" +
      pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*") +
      "$"
  );
  return re.test(file);
}

function applyAllowlistAndTier(
  findings: Finding[],
  tier: SecurityTier,
  allowlist: SecurityAllowlistEntry[]
): Finding[] {
  return findings.map((f): Finding => {
    // Allowlist match (always-block rules cannot be allowlisted).
    if (f.ruleTier !== "always-block") {
      const match = allowlist.find((entry) => {
        if (!allowlistActive(entry)) return false;
        if (entry.rule !== f.ruleId) return false;
        if (entry.pattern) {
          // Pattern allowlists work on advisory rules only.
          if (f.ruleTier === "startup" || f.ruleTier === "regulated") return false;
          return micromatchSafe(f.file, entry.pattern);
        }
        return true;
      });
      if (match) {
        return { ...f, severity: "allowlisted", allowlistedBy: match };
      }
    }

    // Tier modulation. always-block stays "block" everywhere.
    if (f.ruleTier === "always-block") return { ...f, severity: "block" };

    const ruleRank = TIER_RANK[f.ruleTier];
    const activeRank = TIER_RANK[tier];
    if (ruleRank > activeRank) {
      // Rule's tier exceeds active tier; scanner shouldn't have fired but
      // defend anyway by suppressing.
      return { ...f, severity: "allowlisted" };
    }
    if (f.ruleTier === "demo" && tier === "demo") {
      return { ...f, severity: "advisory" };
    }
    return { ...f, severity: "block" };
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

  // Read security tier and allowlist from yaml.
  let yamlConfig: any = {};
  try {
    yamlConfig = YAML.parse(fs.readFileSync(myceliumYamlPath, "utf-8"));
  } catch {}
  const tierRaw = yamlConfig?.organism?.security_tier;
  const securityTier: SecurityTier = isSecurityTier(tierRaw) ? tierRaw : "demo";
  const allowlist: SecurityAllowlistEntry[] = Array.isArray(
    yamlConfig?.organism?.security_allowlist
  )
    ? yamlConfig.organism.security_allowlist
    : [];

  // Categorize allowlist entries by expiry status.
  const todayStr = new Date().toISOString().slice(0, 10);
  const fourteenDaysOut = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const expiredAllowlists = allowlist.filter((e) => e.expires < todayStr);
  const expiringSoonAllowlists = allowlist.filter(
    (e) => e.expires >= todayStr && e.expires < fourteenDaysOut
  );

  // Downgrade detection: compare current tier against the highest tier ever
  // committed in git history. If lower AND no SECURITY-DOWNGRADE.md exists
  // referencing the new tier, hard-fail the audit.
  const priorTier = findPriorSecurityTier(cwd);
  if (priorTier && TIER_RANK[securityTier] < TIER_RANK[priorTier]) {
    const downgradePath = path.join(cwd, "SECURITY-DOWNGRADE.md");
    const downgradeOk =
      fs.existsSync(downgradePath) &&
      fs.readFileSync(downgradePath, "utf-8").includes(securityTier);
    if (!downgradeOk) {
      console.log();
      console.log(
        chalk.red(
          `  ❌ SECURITY DOWNGRADE UNDOCUMENTED: tier ${priorTier} → ${securityTier} but no SECURITY-DOWNGRADE.md exists referencing the new tier.`
        )
      );
      console.log(
        chalk.gray(
          "     Create SECURITY-DOWNGRADE.md at the cultivation root with: timestamp, prior tier, new tier, operator note explaining why."
        )
      );
      return { passed: false, exitCode: 4, summary: "undocumented downgrade" };
    }
  }

  const spinner = ora({
    text: chalk.cyan(
      fix
        ? `Auditing & patching against ${stack.name} (tier: ${securityTier})...`
        : `Auditing against ${stack.name} (tier: ${securityTier}, read-only)...`
    ),
    spinner: "dots",
  }).start();

  // Run scanners and apply tier modulation + allowlist filter.
  spinner.text = chalk.cyan(`Running security scanners (tier: ${securityTier})...`);
  const rawFindings = await runAllScanners(cwd);
  const findings = applyAllowlistAndTier(rawFindings, securityTier, allowlist);
  const blockingFindings = findings.filter((f) => f.severity === "block");
  const advisoryFindings = findings.filter((f) => f.severity === "advisory");
  const allowlistedFindings = findings.filter((f) => f.severity === "allowlisted");

  const prompt = buildAuditPrompt({
    fix,
    nutrientsPath,
    cwd,
    stackName: stack.name,
    renderedAppendix,
    securityTier,
    blockingFindings,
    advisoryFindings,
    allowlistedFindings,
    expiringSoonAllowlists,
    expiredAllowlists,
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
  // Deterministic floor: any blocking security finding fails the audit
  // regardless of agent verdict.
  const blockedBySecurityScanners = blockingFindings.length > 0;
  const passed = !blockedBySecurityScanners && /AUDIT PASS\b/.test(lastText);
  const failed = blockedBySecurityScanners || /AUDIT FAIL\b/.test(lastText);

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
  securityTier: SecurityTier;
  blockingFindings: Finding[];
  advisoryFindings: Finding[];
  allowlistedFindings: Finding[];
  expiringSoonAllowlists: SecurityAllowlistEntry[];
  expiredAllowlists: SecurityAllowlistEntry[];
}): string {
  const {
    fix,
    nutrientsPath,
    stackName,
    renderedAppendix,
    securityTier,
    blockingFindings,
    advisoryFindings,
    allowlistedFindings,
    expiringSoonAllowlists,
    expiredAllowlists,
  } = args;

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
─────────────────────────────────────────────────────────────────────────

─────────────────────────────────────────────────────────────────────────
PRE-COMPUTED SECURITY FINDINGS (tier: ${securityTier})

The following findings were produced by deterministic scanners running
over the cultivation source. Include them VERBATIM in your audit report
under "## 8. Security findings". Do not run grep yourself — the findings
below are authoritative.

### Blocking violations (${blockingFindings.length}):
${
  blockingFindings.length === 0
    ? "(none)"
    : blockingFindings
        .map(
          (f) =>
            `- ${f.ruleId} [${f.ruleTier}${f.stackTag ? `, ${f.stackTag}` : ""}]: ${f.file}${f.match ? ` — ${f.match}` : ""}`
        )
        .join("\n")
}

### Advisories (${advisoryFindings.length}):
${
  advisoryFindings.length === 0
    ? "(none)"
    : advisoryFindings
        .map(
          (f) =>
            `- ${f.ruleId} [${f.ruleTier}${f.stackTag ? `, ${f.stackTag}` : ""}]: ${f.file}${f.match ? ` — ${f.match}` : ""}`
        )
        .join("\n")
}

### Allowlisted (${allowlistedFindings.length}):
${
  allowlistedFindings.length === 0
    ? "(none)"
    : allowlistedFindings
        .map(
          (f) =>
            `- ${f.ruleId}: ${f.file} (allowlist: ${f.allowlistedBy?.reason ?? "n/a"}, expires ${f.allowlistedBy?.expires ?? "n/a"})`
        )
        .join("\n")
}

### Expiring within 14 days (${expiringSoonAllowlists.length}):
${
  expiringSoonAllowlists.length === 0
    ? "(none)"
    : expiringSoonAllowlists
        .map((e) => `- ${e.rule}: ${e.reason} (expires ${e.expires})`)
        .join("\n")
}

### EXPIRED ALLOWLISTS (${expiredAllowlists.length}):
${
  expiredAllowlists.length === 0
    ? "(none)"
    : expiredAllowlists
        .map((e) => `- ${e.rule}: ${e.reason} (expired ${e.expires}) — original findings now active`)
        .join("\n")
}
─────────────────────────────────────────────────────────────────────────`;
}

async function runUpgradeTier(cwd: string, newTierRaw: string): Promise<void> {
  if (!isSecurityTier(newTierRaw)) {
    console.log(
      chalk.red(`  ❌ Invalid tier "${newTierRaw}". Available: demo, startup, regulated`)
    );
    process.exit(1);
  }
  const newTier = newTierRaw as SecurityTier;
  const yamlPath = path.join(cwd, "mycelium.yaml");
  const nutrientsPath = path.join(cwd, "NUTRIENTS.md");
  if (!fs.existsSync(yamlPath)) {
    console.log(chalk.red("  ❌ mycelium.yaml not found."));
    process.exit(1);
  }
  const config = YAML.parse(fs.readFileSync(yamlPath, "utf-8"));
  const currentTierRaw = config?.organism?.security_tier;
  if (!isSecurityTier(currentTierRaw)) {
    console.log(
      chalk.red("  ❌ mycelium.yaml has no organism.security_tier — re-plant with --security.")
    );
    process.exit(1);
  }
  const currentTier = currentTierRaw as SecurityTier;

  if (TIER_RANK[newTier] <= TIER_RANK[currentTier]) {
    console.log(
      chalk.red(
        `  ❌ Cannot ${newTier === currentTier ? "remain at" : "downgrade to"} ${newTier} (current: ${currentTier}).`
      )
    );
    if (newTier !== currentTier) {
      console.log(
        chalk.gray(
          "     Downgrades require manual mycelium.yaml edit + a SECURITY-DOWNGRADE.md file (see docs)."
        )
      );
    }
    process.exit(1);
  }

  const stackName = config?.organism?.stack;
  const stack = stackName ? getStack(stackName) : null;
  if (!stack) {
    console.log(
      chalk.red(`  ❌ Cannot resolve stack "${stackName}" from yaml.`)
    );
    process.exit(1);
  }

  config.organism.security_tier = newTier;
  fs.writeFileSync(
    yamlPath,
    "# Mycelium Framework — VibeSpace LLC — The network provides.\n\n" +
      YAML.stringify(config),
    "utf-8"
  );

  if (fs.existsSync(nutrientsPath)) {
    const nutrients = fs.readFileSync(nutrientsPath, "utf-8");
    const hSectionRe = /### H\. Security Rules[\s\S]*?(?=\n## |\n# |$)/;
    const newH = `### H. Security Rules\n\n${stack.contractAppendix.securityRules}`;
    const updated = hSectionRe.test(nutrients)
      ? nutrients.replace(hSectionRe, newH)
      : nutrients + "\n\n" + newH;
    fs.writeFileSync(nutrientsPath, updated, "utf-8");
  }

  console.log(
    chalk.greenBright(
      `  ✓ Upgraded security_tier: ${currentTier} → ${newTier}`
    )
  );
  console.log(
    chalk.gray(
      `     Run \`mycelium contracts audit\` to see what now blocks freeze.`
    )
  );
}

