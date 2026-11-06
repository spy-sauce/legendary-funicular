// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `testers-runner.ts` — spawn a Claude Agent SDK session per tester.
//
// Mirrors the buildLeafPrompt skeleton from cultivate.ts (module-private —
// do NOT import). Tester sessions get a locked-down tool budget: Read + Bash
// only. Write/Edit are never granted, even if the HYPHA-TEST-*.md declares them.
//
// The tester's job: exercise the cultivated app against its assertion set,
// emit one Finding JSON to <auditRunDir>/testers/<tester_id>/finding.json if
// any assertion fails, or no file at all if the cultivation passes.

import fs from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { TesterDef, TesterResult } from "./testers.js";
import type { Finding } from "./findings.js";
import { runMicroFanout } from "../micro-agents/fanout.js";
import { scanReReads } from "../micro-agents/metrics.js";
import type { MicroCallRecord } from "../micro-agents/types.js";

// ── Types for runner context ────────────────────────────────────────────

export interface RunTesterContext {
  auditRunDir: string;
  cultivationDir: string;
  iteration: number;
  microsEnabled?: boolean;                 // default true; --no-micros sets false
  contractHash?: string;                   // for micro cache keys (default "unfrozen")
  microStore?: import("../cache-network/store.js").CacheStoreWithMissRecording;
}

// ── Extended TesterDef with runner-parsed fields ────────────────────────
// NUTRIENTS §4 defines the frozen base TesterDef. Per the loader's design
// (testers-loader.ts), the "Repro recipe" and "Suggested fix template" sections
// are NOT stored in TesterDef to keep the contract unchanged. Instead, the
// runner re-parses the hypha_path file to extract these sections for prompts.

interface TesterDefExtended extends TesterDef {
  /** Free-text repro recipe from HYPHA-TEST-*.md "## Repro recipe" section */
  repro_recipe?: string;
  /** Free-text fix template from HYPHA-TEST-*.md "## Suggested fix template" section */
  suggested_fix_template?: string;
}

/**
 * Extract a free-text section from a HYPHA-TEST-*.md file by heading.
 * Looks for `## <sectionName>` and collects all lines until the next `##` heading.
 */
function extractSection(content: string, sectionName: string): string {
  const lines = content.split("\n");
  const headingPattern = new RegExp(
    `^##\\s+${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
    "i"
  );
  let capturing = false;
  const captured: string[] = [];

  for (const line of lines) {
    if (capturing) {
      // Stop at next ## heading
      if (/^##\s+/.test(line)) {
        break;
      }
      captured.push(line);
    } else if (headingPattern.test(line)) {
      capturing = true;
    }
  }

  // Trim leading/trailing empty lines and join
  return captured.join("\n").trim();
}

/**
 * Parse additional sections from the HYPHA-TEST-*.md file that are not part of
 * the frozen TesterDef contract. Called by the runner to populate prompt fields.
 */
function parseHyphaExtendedSections(
  def: TesterDef
): { repro_recipe?: string; suggested_fix_template?: string } {
  try {
    const content = fs.readFileSync(def.hypha_path, "utf-8");
    const repro_recipe = extractSection(content, "Repro recipe") || undefined;
    const suggested_fix_template =
      extractSection(content, "Suggested fix template") || undefined;
    return { repro_recipe, suggested_fix_template };
  } catch {
    // File not readable — return empty, let prompt show default placeholders
    return {};
  }
}

// ── Active session tracking (for graceful shutdown) ─────────────────────

const activeTesterSessions = new Set<any>();

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

/**
 * Close all active tester sessions. Called on SIGINT/SIGTERM or crash recovery.
 */
export async function closeAllTesterSessions(): Promise<void> {
  const pending = Array.from(activeTesterSessions);
  activeTesterSessions.clear();
  await Promise.allSettled(pending.map((s) => closeStream(s)));
}

// ── Prompt builder (mirrors buildLeafPrompt at cultivate.ts:746) ────────

/**
 * Build the prompt for a tester session. Same skeleton as buildLeafPrompt but
 * body focuses on assertions rather than deliverables. Module-private in
 * cultivate.ts — we replicate the structure here per NUTRIENTS §10.
 */
function buildTesterPrompt(def: TesterDefExtended, ctx: RunTesterContext, foldedContext: string): string {
  const findingJsonPath = path.join(
    ctx.auditRunDir,
    "testers",
    def.id,
    "finding.json"
  );

  // Relative paths for cleaner prompt display
  const findingRelPath = path.relative(ctx.cultivationDir, findingJsonPath);

  return [
    `You are the \`${def.id}\` tester in an audit-run of the cultivation.`,
    ``,
    `Tester ID:      ${def.id}`,
    `Mirrors biome:  ${def.mirrors_biome ?? "(cross-cutting)"}`,
    `Scope:          ${def.scope}`,
    `Iteration:      ${ctx.iteration}`,
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    `YOUR MISSION`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    foldedContext
      ? `1. Your INPUTS are summarized below under "Gathered Context" — RELY on those summaries. Only re-READ a raw file if a summary is insufficient for a specific assertion.`
      : `1. READ the cultivated artifacts listed in your INPUTS.`,
    `2. EXERCISE each assertion in your assertion set (below).`,
    `3. If ALL assertions pass, do NOT write any file — exit cleanly.`,
    `4. If ANY assertion fails, emit exactly ONE Finding JSON to:`,
    `     ${findingRelPath}`,
    `   Then exit. Do not continue testing after the first failure.`,
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    `TOOL BUDGET — Read + Bash ONLY`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    `You have access to Read and Bash. You do NOT have Write or Edit.`,
    `To emit your Finding, use Bash to write the JSON:`,
    ``,
    `  mkdir -p "$(dirname '${findingRelPath}')"`,
    `  cat > '${findingRelPath}' << 'FINDING_EOF'`,
    `  { ... your Finding JSON ... }`,
    `  FINDING_EOF`,
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    `FINDING SCHEMA (frozen — do not deviate)`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    `{`,
    `  "id": "<sha256(tester_id|biome|summary|file_path|line_range)>",`,
    `  "tester_id": "${def.id}",`,
    `  "biome": "${def.mirrors_biome ?? "cross-cutting"}",`,
    `  "severity": "critical" | "major" | "minor",`,
    `  "file_path": "<path to offending file, if applicable>",`,
    `  "line_range": [<start>, <end>],  // optional`,
    `  "summary": "<one-line headline>",`,
    `  "detail": "<multi-line root-cause explanation>",`,
    `  "repro_steps": ["<step 1>", "<step 2>", ...],`,
    `  "suggested_fix": "<free-text fix guidance>",`,
    `  "observed_at": "<ISO-8601 with ms>",`,
    `  "iteration": ${ctx.iteration}`,
    `}`,
    ``,
    `Severity guide:`,
    `  - critical: blocks contract-freeze on re-plant; must fix before shipping`,
    `  - major: blocks harvest threshold; significant defect`,
    `  - minor: informational; included in brief but non-blocking`,
    ``,
    `To compute the "id" field, concatenate these with "|" separators:`,
    `  tester_id | biome | summary | file_path (or empty) | line_range (e.g. "10-20" or empty)`,
    `Then SHA-256 hash that string (lowercase hex, 64 chars).`,
    ``,
    ...(foldedContext ? [foldedContext, ``] : []),
    `═══════════════════════════════════════════════════════════════════════`,
    `INPUTS (read-only artifacts to examine)`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    ...(def.inputs.length > 0
      ? def.inputs.map((inp) => `  - ${inp}`)
      : ["  (none specified — examine the full cultivation)"]),
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    `ASSERTIONS (your test criteria)`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    def.assertion_summary || "(no assertions specified)",
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    `REPRO RECIPE (commands/steps to reproduce if assertion fails)`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    def.repro_recipe || "(use these as finding.repro_steps if assertion fails)",
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    `SUGGESTED FIX TEMPLATE`,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    def.suggested_fix_template ||
      "(use as starting point for finding.suggested_fix)",
    ``,
    `═══════════════════════════════════════════════════════════════════════`,
    ``,
    `Execute your assertions now. If all pass, exit with no Finding file.`,
    `If any fail, emit the Finding JSON and stop.`,
    ``,
    `The network provides. 🍄`,
  ].join("\n");
}

// ── The actual SDK spawn per tester ─────────────────────────────────────

/**
 * Run a single tester. Spawns a Claude Agent SDK session with Read + Bash only.
 *
 * Per NUTRIENTS §4:
 * - Stdout → <auditRunDir>/testers/<tester_id>/stdout.log
 * - Stderr → <auditRunDir>/testers/<tester_id>/stderr.log
 * - Finding → <auditRunDir>/testers/<tester_id>/finding.json (if assertion fails)
 * - On SDK crash/timeout: log tester_error, return TesterResult with finding: null
 */
export async function runTester(
  def: TesterDef,
  ctx: RunTesterContext
): Promise<TesterResult> {
  const started = Date.now();

  // Parse extended sections from the HYPHA-TEST-*.md file
  // These are NOT part of the frozen TesterDef contract, so the runner
  // re-parses the file to extract them for the prompt.
  const extendedSections = parseHyphaExtendedSections(def);
  const extDef: TesterDefExtended = { ...def, ...extendedSections };

  // Create tester output directory
  const testerDir = path.join(ctx.auditRunDir, "testers", def.id);
  fs.mkdirSync(testerDir, { recursive: true });

  const stdoutPath = path.join(testerDir, "stdout.log");
  const stderrPath = path.join(testerDir, "stderr.log");
  const findingPath = path.join(testerDir, "finding.json");

  // Initialize log streams
  const stdoutStream = fs.createWriteStream(stdoutPath, { flags: "w" });
  const stderrStream = fs.createWriteStream(stderrPath, { flags: "w" });

  const logStdout = (line: string) => stdoutStream.write(line + "\n");
  const logStderr = (line: string) => stderrStream.write(line + "\n");

  let stdoutBuffer = "";
  const logStdoutBuf = (line: string) => { stdoutBuffer += line + "\n"; logStdout(line); };

  logStdout(`[${new Date().toISOString()}] Tester ${def.id} started`);
  logStdout(`Iteration: ${ctx.iteration}`);
  logStdout(`Mirrors biome: ${def.mirrors_biome ?? "(cross-cutting)"}`);
  logStdout(`Scope: ${def.scope}`);
  logStdout(`Inputs: ${def.inputs.join(", ") || "(none)"}`);
  logStdout("─".repeat(70));

  // ── Read-side micro fan-out (Spec §3) ──────────────────────────────
  const micrsEnabled = ctx.microsEnabled !== false; // default ON
  let microRecords: MicroCallRecord[] = [];
  let microFoldedTargets: string[] = [];
  let foldedContext = "";
  if (micrsEnabled) {
    const fan = await runMicroFanout({
      testerId: def.id,
      inputs: def.inputs,
      cultivationDir: ctx.cultivationDir,
      contractHash: ctx.contractHash ?? "unfrozen",
      store: ctx.microStore,
    });
    foldedContext = fan.foldedContext;
    microRecords = fan.records;
    microFoldedTargets = fan.foldedTargets;
  }

  // Build the tester prompt
  const prompt = buildTesterPrompt(extDef, ctx, foldedContext);
  logStdout("[PROMPT]");
  logStdout(prompt);
  logStdout("─".repeat(70));

  let stream: any;
  let exitCode = 0;

  try {
    // Spawn Claude Agent SDK session with ONLY Read + Bash
    // Per NUTRIENTS §4: "Tool budget enforced: only Read + Bash by default;
    // never Write/Edit unless --autofix is on, and even then Write/Edit are
    // reserved for the re-plant biome leaves, NOT the tester itself."
    stream = query({
      prompt,
      options: {
        cwd: ctx.cultivationDir,
        allowedTools: ["Read", "Bash", "Glob", "Grep"],
        permissionMode: "acceptEdits",
      },
    });
    activeTesterSessions.add(stream);

    // Consume the stream, logging output
    for await (const msg of stream) {
      if (msg.type === "assistant") {
        const blocks = (msg as any).message?.content ?? [];
        for (const b of blocks) {
          if (b.type === "text" && typeof b.text === "string") {
            logStdoutBuf(`[ASSISTANT] ${b.text}`);
          } else if (b.type === "tool_use") {
            logStdoutBuf(
              `[TOOL_USE] ${b.name}: ${JSON.stringify(b.input).slice(0, 200)}`
            );
          }
        }
      } else if (msg.type === "user") {
        const blocks = (msg as any).message?.content ?? [];
        for (const b of blocks) {
          if (b.type === "tool_result") {
            const content =
              typeof b.content === "string"
                ? b.content
                : JSON.stringify(b.content);
            logStdoutBuf(`[TOOL_RESULT] ${content.slice(0, 500)}`);
          }
        }
      } else if (msg.type === "result") {
        logStdoutBuf(`[RESULT] ${JSON.stringify(msg)}`);
        if ((msg as any).subtype === "error_max_budget_usd") {
          exitCode = 1;
          logStderr(
            `[ERROR] Budget exceeded: $${(msg as any).total_cost_usd}`
          );
        }
      }
    }

    activeTesterSessions.delete(stream);
    await closeStream(stream);
  } catch (err: any) {
    // SDK crash or timeout — log as tester_error (operator concern)
    exitCode = 2;
    const errMsg = err?.message ?? String(err);
    logStderr(`[TESTER_ERROR] ${errMsg}`);
    logStderr(`[STACK] ${err?.stack ?? "(no stack)"}`);

    if (stream) {
      activeTesterSessions.delete(stream);
      await closeStream(stream);
    }
  }

  // Close log streams
  stdoutStream.end();
  stderrStream.end();

  // Wait for streams to flush
  await Promise.all([
    new Promise<void>((resolve) => stdoutStream.on("finish", resolve)),
    new Promise<void>((resolve) => stderrStream.on("finish", resolve)),
  ]);

  // Parse finding.json if it exists
  let finding: Finding | null = null;
  if (fs.existsSync(findingPath)) {
    try {
      const raw = fs.readFileSync(findingPath, "utf-8");
      finding = JSON.parse(raw) as Finding;
      exitCode = 1; // Finding present means assertion failed
    } catch (parseErr: any) {
      // Malformed finding.json — log to stderr but don't crash
      const errPath = path.join(testerDir, "parse-error.log");
      fs.writeFileSync(
        errPath,
        `Failed to parse finding.json: ${parseErr?.message}\n`
      );
    }
  }

  const wall_ms = Date.now() - started;

  const microReReads = micrsEnabled ? scanReReads(stdoutBuffer, microFoldedTargets) : 0;

  return {
    tester_id: def.id,
    exit_code: exitCode,
    wall_ms,
    finding,
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
    micro_records: microRecords,
    micro_folded_targets: microFoldedTargets,
    micro_redundant_re_reads: microReReads,
  };
}
