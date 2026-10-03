// Mycelium Framework — VibeSpace LLC — The network provides.
//
// ledger/render.ts — human-facing rendering for `mycelium ledger`, matching
// the style conventions of cli/src/lib/eval/report.ts (cli-table3 + chalk,
// magenta heads, gray borders). Discrepancies are rendered FIRST (ranked
// critical→warn→info), then the per-leaf table, then a verdict line.

import chalk from "chalk";
import Table from "cli-table3";
import type {
  LedgerReport,
  Discrepancy,
  DiscrepancySeverity,
  LeafLedgerEntry,
} from "./types.js";

function sevTag(sev: DiscrepancySeverity): string {
  switch (sev) {
    case "critical":
      return chalk.red.bold("CRIT");
    case "warn":
      return chalk.yellow.bold("WARN");
    case "info":
      return chalk.gray("INFO");
  }
}

function worstGlyph(worst: DiscrepancySeverity | null): string {
  if (worst === null) return chalk.green("✓");
  if (worst === "info") return chalk.gray("i");
  if (worst === "warn") return chalk.yellow("!");
  return chalk.red("✗");
}

function intGlyph(integrated: boolean | null): string {
  if (integrated === null) return chalk.gray("—");
  return integrated ? chalk.green("✓") : chalk.red("✗");
}

function num(n: number | null): string {
  return n === null ? chalk.gray("—") : String(n);
}

function discrepancyLines(discs: Discrepancy[]): string {
  if (discs.length === 0) {
    return chalk.green("  ✓ No discrepancies — every claim reconciles.");
  }
  const lines: string[] = [];
  for (const d of discs) {
    const leaf = d.leaf === "(run)" ? chalk.magenta("(run)") : chalk.cyan(d.leaf);
    let line =
      `  ${sevTag(d.severity)}  ${leaf}  ${chalk.white(d.check)}  ` +
      `${chalk.gray("claimed")} ${d.claimed} ${chalk.gray("→ observed")} ${d.observed}`;
    if (d.note) line += chalk.gray(`  (${d.note})`);
    lines.push(line);
  }
  return lines.join("\n");
}

function leafTable(entries: LeafLedgerEntry[]): string {
  const table = new Table({
    head: [
      chalk.magenta("leaf"),
      chalk.magenta("status"),
      chalk.magenta("files (claim/git)"),
      chalk.magenta("commit"),
      chalk.magenta("integ"),
      chalk.magenta("cost"),
      chalk.magenta("dur(s)"),
      chalk.magenta(""),
    ],
    style: { head: [], border: ["gray"] },
  });

  for (const e of entries) {
    const statusCell =
      e.status === "done"
        ? chalk.green(e.status)
        : e.status === "failed"
        ? chalk.red(e.status)
        : e.status === "conflicted"
        ? chalk.yellow(e.status)
        : chalk.gray(e.status);
    table.push([
      chalk.cyan(e.leaf),
      statusCell,
      `${num(e.files_claimed)}/${num(e.files_actual)}`,
      e.commit_short ? chalk.gray(e.commit_short) : chalk.gray("—"),
      intGlyph(e.integrated),
      e.cost_usd === null ? chalk.gray("—") : `$${e.cost_usd.toFixed(4)}`,
      e.duration_seconds === null ? chalk.gray("—") : e.duration_seconds.toFixed(1),
      worstGlyph(e.worst),
    ]);
  }

  return table.toString();
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Full rendered ledger report (header + discrepancies + table + verdict). */
export function renderLedger(report: LedgerReport): string {
  const out: string[] = [];

  out.push("");
  out.push(
    chalk.magentaBright.bold("  📒 Ledger ") +
      chalk.gray("— run reconciliation: claims vs git/fs/telemetry truth")
  );
  out.push("");

  // Header block
  out.push(
    chalk.gray("  run_id:   ") +
      (report.run_id ? chalk.yellow(report.run_id) : chalk.gray("(none)"))
  );
  out.push(
    chalk.gray("  organism: ") +
      (report.organism ? chalk.white(report.organism) : chalk.gray("(unknown)"))
  );
  if (report.when)
    out.push(chalk.gray("  when:     ") + chalk.white(report.when));
  out.push(
    chalk.gray("  leaves:   ") +
      chalk.white(`${report.leaves_ok}/${report.leaves_total} ok`)
  );
  out.push(
    chalk.gray("  cost:     ") +
      chalk.white(`$${report.total_cost_usd.toFixed(4)}`) +
      chalk.gray("   tokens: ") +
      chalk.white(
        `${fmtTokens(report.total_input_tokens)} in / ${fmtTokens(
          report.total_output_tokens
        )} out`
      )
  );

  // Availability / skipped notes
  if (report.availability.skipped.length > 0) {
    out.push("");
    for (const s of report.availability.skipped) {
      out.push(chalk.yellow(`  ⚠ ${s}`));
    }
  }

  // Discrepancies FIRST
  out.push("");
  out.push(chalk.white.bold("  DISCREPANCIES") + chalk.gray(" (critical → warn → info)"));
  out.push(discrepancyLines(report.discrepancies));

  // Per-leaf table
  if (report.leaves.length > 0) {
    out.push("");
    out.push(chalk.white.bold("  LEAVES"));
    out.push(leafTable(report.leaves));
  }

  // Verdict
  out.push("");
  if (report.discrepancies.length === 0) {
    out.push(chalk.greenBright.bold("  ✓ CLEAN") + chalk.gray(" — all claims reconcile."));
  } else {
    const { critical, warn, info } = report.counts;
    const total = critical + warn + info;
    const parts: string[] = [];
    if (critical) parts.push(chalk.red(`${critical} critical`));
    if (warn) parts.push(chalk.yellow(`${warn} warn`));
    if (info) parts.push(chalk.gray(`${info} info`));
    const tint = critical > 0 ? chalk.red.bold : warn > 0 ? chalk.yellow.bold : chalk.gray.bold;
    out.push(
      tint(`  ${total} discrepanc${total === 1 ? "y" : "ies"}`) +
        chalk.gray(` (${parts.join(", ")})`)
    );
  }
  out.push("");

  return out.join("\n");
}
