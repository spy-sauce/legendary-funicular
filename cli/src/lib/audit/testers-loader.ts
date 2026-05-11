// Tester loader — scans hyphae/HYPHA-TEST-*.md, parses CACHE HEADER per NUTRIENTS §6.
//
// Part of the audit-run cultivation. Throws on malformed HYPHA — operator concern,
// not a silent skip. Sibling leaf audit.testers.types exports TesterDef from ./testers.ts.

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { TesterDef } from "./testers.js";

/**
 * Thrown when a HYPHA-TEST-*.md file is malformed — missing a required field
 * or has an unparseable CACHE HEADER structure.
 */
export class MalformedTesterError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly reason: string,
    public readonly line?: number
  ) {
    const loc = line !== undefined ? `:${line}` : "";
    super(`Malformed tester HYPHA at ${filePath}${loc}: ${reason}`);
    this.name = "MalformedTesterError";
  }
}

/**
 * Load all testers from a cultivation directory.
 *
 * Scans <cultivationDir>/hyphae/HYPHA-TEST-*.md (glob; alphabetical order).
 * Parses the CACHE HEADER per NUTRIENTS §6.
 *
 * @throws MalformedTesterError if a required field is missing or malformed.
 */
export function loadTesters(cultivationDir: string): TesterDef[] {
  const hyphaeDir = join(cultivationDir, "hyphae");

  let entries: string[];
  try {
    entries = readdirSync(hyphaeDir);
  } catch (err: unknown) {
    // No hyphae directory — no testers. Not an error; just an empty cultivation.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  // Filter to HYPHA-TEST-*.md files, alphabetical order
  const testerFiles = entries
    .filter((f) => f.startsWith("HYPHA-TEST-") && f.endsWith(".md"))
    .sort();

  const testers: TesterDef[] = [];

  for (const file of testerFiles) {
    const filePath = join(hyphaeDir, file);
    const content = readFileSync(filePath, "utf-8");
    const def = parseTesterHypha(filePath, content);
    testers.push(def);
  }

  return testers;
}

/**
 * Filter testers by optional criteria.
 * Used by CLI for --only-tester flag.
 */
export function filterTesters(
  testers: TesterDef[],
  opts: { onlyTesterId?: string }
): TesterDef[] {
  if (!opts.onlyTesterId) {
    return testers;
  }
  return testers.filter((t) => t.id === opts.onlyTesterId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a single HYPHA-TEST-*.md file into a TesterDef.
 *
 * Expected format per NUTRIENTS §6:
 *
 * ```markdown
 * # HYPHA-TEST — <tester-id>
 *
 * ## CACHE HEADER
 * - **TESTER_ID:** tester.<name>
 * - **MIRRORS_BIOME:** <biome-id> | (cross-cutting)
 * - **SCOPE:** <one-line>
 * - **INPUTS:** <comma-list of cultivated artifact paths + NUTRIENTS sections>
 * - **TOOLS:** Read, Bash  (default — Write/Edit never granted)
 *
 * ## Assertions
 * <free-text description>
 *
 * ## Repro recipe
 * <ordered commands>
 *
 * ## Suggested fix template
 * <free-text>
 * ```
 */
function parseTesterHypha(filePath: string, content: string): TesterDef {
  const lines = content.split("\n");

  // Extract CACHE HEADER fields
  const testerId = extractCacheField(lines, "TESTER_ID", filePath);
  const mirrorsBiomeRaw = extractCacheField(lines, "MIRRORS_BIOME", filePath);
  const scope = extractCacheField(lines, "SCOPE", filePath);
  const inputsRaw = extractCacheField(lines, "INPUTS", filePath);
  const toolsRaw = extractCacheFieldOptional(lines, "TOOLS");

  // Validate TESTER_ID format
  if (!testerId.startsWith("tester.")) {
    throw new MalformedTesterError(
      filePath,
      `TESTER_ID must start with "tester." — got "${testerId}"`
    );
  }

  // Parse MIRRORS_BIOME: literal "(cross-cutting)" means null
  const mirrorsBiome =
    mirrorsBiomeRaw.toLowerCase() === "(cross-cutting)" ||
    mirrorsBiomeRaw === ""
      ? null
      : mirrorsBiomeRaw;

  // Parse INPUTS: comma-separated list
  const inputs = inputsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Parse TOOLS: default is ["Read", "Bash"]; strip Write/Edit if present (per HYPHA spec)
  let tools: ("Read" | "Bash")[] = ["Read", "Bash"];
  if (toolsRaw) {
    const declared = toolsRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Filter to allowed tools only (Read, Bash). Log warning for Write/Edit.
    const allowed: ("Read" | "Bash")[] = [];
    for (const t of declared) {
      if (t === "Read" || t === "Bash") {
        allowed.push(t);
      } else if (t === "Write" || t === "Edit") {
        // Per HYPHA-AUDIT-TESTERS-AGENT.md: "log a warning and strip them"
        console.warn(
          `[audit.testers.loader] WARNING: ${filePath} declares forbidden tool "${t}" — stripped from budget`
        );
      }
      // Ignore unknown tools silently
    }
    if (allowed.length > 0) {
      tools = allowed;
    }
  }

  // Extract free-text sections
  // NOTE: "Repro recipe" and "Suggested fix template" sections are parsed
  // but NOT stored in TesterDef — the runner re-parses the hypha_path file
  // when building the tester prompt. TesterDef is a frozen contract (NUTRIENTS §4)
  // and must not be extended without unfreezing.
  const assertionSummary = extractSection(lines, "Assertions");

  return {
    id: testerId,
    mirrors_biome: mirrorsBiome,
    scope,
    inputs,
    assertion_summary: assertionSummary,
    tools,
    hypha_path: filePath,
  };
}

/**
 * Extract a required field from the CACHE HEADER.
 * Format: `- **FIELD_NAME:** value`
 */
function extractCacheField(
  lines: string[],
  fieldName: string,
  filePath: string
): string {
  const pattern = new RegExp(
    `^\\s*-\\s*\\*\\*${fieldName}:\\*\\*\\s*(.*)$`,
    "i"
  );

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(pattern);
    if (match) {
      const value = match[1].trim();
      if (value.length === 0) {
        throw new MalformedTesterError(
          filePath,
          `${fieldName} field is empty`,
          i + 1
        );
      }
      return value;
    }
  }

  throw new MalformedTesterError(
    filePath,
    `Missing required field: ${fieldName}`
  );
}

/**
 * Extract an optional field from the CACHE HEADER.
 * Returns undefined if not found.
 */
function extractCacheFieldOptional(
  lines: string[],
  fieldName: string
): string | undefined {
  const pattern = new RegExp(
    `^\\s*-\\s*\\*\\*${fieldName}:\\*\\*\\s*(.*)$`,
    "i"
  );

  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

/**
 * Extract a free-text section by heading.
 * Looks for `## <sectionName>` and collects all lines until the next `##` heading.
 */
function extractSection(lines: string[], sectionName: string): string {
  const headingPattern = new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`, "i");
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
  const trimmed = captured
    .join("\n")
    .trim();

  return trimmed;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
