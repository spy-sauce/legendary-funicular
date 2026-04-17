// Mycelium Framework — VibeSpace LLC — The network provides.
//
// GitHub issue sink for alerting subsystem.
//
// Creates GitHub issues via the `gh` CLI subprocess. Feature-detects gh
// availability before attempting issue creation. Never throws — all errors
// are caught and logged to stderr.
//
// Frozen contract dependency: NUTRIENTS.md §7 (AlertPayload).

import { execSync, execFileSync } from "node:child_process";
import type { AlertPayload } from "./alert-triggers.js";

/**
 * In-memory cache for deduplication.
 * Maps title → timestamp of last issue creation.
 * Prevents alert storms by skipping duplicate titles within 5 minutes.
 */
const recentTitles = new Map<string, number>();

/**
 * Rate limit window in milliseconds (5 minutes).
 */
const RATE_LIMIT_MS = 5 * 60 * 1000;

/**
 * Check if `gh` CLI is available on this system.
 * Caches the result for the lifetime of the process.
 */
let ghAvailable: boolean | null = null;

function isGhAvailable(): boolean {
  if (ghAvailable !== null) {
    return ghAvailable;
  }

  try {
    // Try to execute `gh --version` to detect presence
    execFileSync("gh", ["--version"], {
      stdio: "pipe",
      timeout: 5000,
    });
    ghAvailable = true;
  } catch {
    // gh not found or not executable
    ghAvailable = false;
  }

  return ghAvailable;
}

/**
 * Check if a title was recently used (within RATE_LIMIT_MS).
 * If so, skip to prevent alert storms.
 */
function isRateLimited(title: string): boolean {
  const now = Date.now();
  const lastFired = recentTitles.get(title);

  if (lastFired !== undefined && now - lastFired < RATE_LIMIT_MS) {
    return true;
  }

  return false;
}

/**
 * Record that we just fired an alert with this title.
 */
function recordTitle(title: string): void {
  recentTitles.set(title, Date.now());

  // Prune old entries to prevent unbounded memory growth
  const now = Date.now();
  for (const [key, ts] of recentTitles.entries()) {
    if (now - ts > RATE_LIMIT_MS) {
      recentTitles.delete(key);
    }
  }
}

/**
 * Map severity to label name for GitHub issue.
 */
function severityToLabel(severity: AlertPayload["severity"]): string {
  switch (severity) {
    case "critical":
      return "critical";
    case "error":
      return "error";
    case "warn":
      return "warning";
    case "info":
      return "info";
    default:
      return "alert";
  }
}

/**
 * Post an alert as a GitHub issue.
 *
 * - Feature-detects `gh` CLI; returns immediately if unavailable.
 * - Requires GH_TOKEN env var or `gh` to be pre-authenticated.
 * - Rate-limits: same title skipped if fired within last 5 minutes.
 * - Never throws — catches all errors and logs to stderr.
 *
 * @param payload The alert payload to post.
 */
export async function postGitHubIssue(payload: AlertPayload): Promise<void> {
  // Feature detection: skip if gh is not available
  if (!isGhAvailable()) {
    // Silent skip — gh not installed, nothing to do
    return;
  }

  // Build the issue title with prefix
  const issueTitle = `[mycelium][${payload.severity}] ${payload.title}`;

  // Rate limit check: skip if same title fired recently
  if (isRateLimited(issueTitle)) {
    // eslint-disable-next-line no-console
    console.error(
      `[alerting:github] skipping duplicate issue (rate limited): ${issueTitle}`
    );
    return;
  }

  // Build labels: always include mycelium + severity
  const labels = `mycelium,${severityToLabel(payload.severity)}`;

  // Build the issue body with full context
  const body = buildIssueBody(payload);

  try {
    // Record title before attempting to prevent race conditions
    recordTitle(issueTitle);

    // Execute gh issue create
    // Using execSync for simplicity; async would require spawn + promise wrapper
    execSync(
      `gh issue create --title "${escapeShellArg(issueTitle)}" --body "${escapeShellArg(body)}" --label "${labels}"`,
      {
        stdio: "pipe",
        timeout: 30000, // 30 second timeout
        encoding: "utf-8",
      }
    );

    // eslint-disable-next-line no-console
    console.error(`[alerting:github] created issue: ${issueTitle}`);
  } catch (err: unknown) {
    // Log failure but never throw
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[alerting:github] failed to create issue: ${message}`);

    // Remove from recent titles since creation failed
    // (allows retry on next occurrence)
    recentTitles.delete(issueTitle);
  }
}

/**
 * Build the issue body from an alert payload.
 */
function buildIssueBody(payload: AlertPayload): string {
  const sections: string[] = [];

  // Header section with metadata
  sections.push(`## Alert Details`);
  sections.push("");
  sections.push(`| Field | Value |`);
  sections.push(`| --- | --- |`);
  sections.push(`| **Severity** | ${severityEmoji(payload.severity)} ${payload.severity} |`);
  sections.push(`| **Source** | ${payload.source} |`);
  sections.push(`| **Organism** | ${payload.organism} |`);
  sections.push(`| **Run ID** | \`${payload.run_id}\` |`);

  if (payload.leaf_id) {
    sections.push(`| **Leaf** | \`${payload.leaf_id}\` |`);
  }

  if (payload.biome) {
    sections.push(`| **Biome** | ${payload.biome} |`);
  }

  if (payload.event_log_url) {
    sections.push(`| **Event Log** | [View Log](${payload.event_log_url}) |`);
  }

  sections.push("");

  // Detail section (already markdown)
  sections.push(`## Description`);
  sections.push("");
  sections.push(payload.detail);
  sections.push("");

  // Footer
  sections.push("---");
  sections.push("*This issue was automatically created by the Mycelium alerting system.*");

  return sections.join("\n");
}

/**
 * Get emoji for severity level.
 */
function severityEmoji(severity: AlertPayload["severity"]): string {
  switch (severity) {
    case "critical":
      return "\u{1F6A8}"; // 🚨
    case "error":
      return "\u{1F534}"; // 🔴
    case "warn":
      return "\u{1F7E1}"; // 🟡
    case "info":
      return "\u{1F535}"; // 🔵
    default:
      return "\u{2139}\u{FE0F}"; // ℹ️
  }
}

/**
 * Escape a string for safe use in shell arguments.
 * Replaces double quotes and backslashes.
 */
function escapeShellArg(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

/**
 * Clear the rate limit cache.
 * Exposed for testing purposes.
 */
export function clearRateLimitCache(): void {
  recentTitles.clear();
}

/**
 * Reset gh availability check.
 * Exposed for testing purposes.
 */
export function resetGhAvailability(): void {
  ghAvailable = null;
}
