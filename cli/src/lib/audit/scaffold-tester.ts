// Mycelium Framework — VibeSpace LLC — The network provides.
//
// `mycelium audit-run scaffold-tester <biome>` — emits a stub HYPHA-TEST-<biome>.md
// from an existing biome HYPHA spec, pre-filling the tester skeleton so the operator
// can focus on writing assertions.
//
// NUTRIENTS §6 defines the HYPHA-TEST-*.md authoring schema.
// NUTRIENTS §4 defines the TesterDef interface the loader expects.

import fs from "node:fs";
import path from "node:path";

/**
 * Error thrown when scaffold-tester fails.
 */
export class ScaffoldTesterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldTesterError";
  }
}

/**
 * Parsed fields from a biome HYPHA file's CACHE HEADER and sections.
 */
export interface BiomeHyphaInfo {
  /** The biome id (e.g., "audit-findings") */
  biomeId: string;
  /** SCOPE line from CACHE HEADER */
  scope: string;
  /** File paths from Deliverables section (if parseable) */
  deliverables: string[];
  /** Acceptance criteria lines (if present) */
  acceptanceCriteria: string[];
}

/**
 * Find the HYPHA file for a given biome in the cultivation directory.
 * Checks for HYPHA-<BIOME>.md first, then HYPHA-<BIOME>-AGENT.md (legacy).
 *
 * @param cultivationDir - Path to the cultivation directory
 * @param biome - The biome id (kebab-case, e.g., "talent-onboarding")
 * @returns Absolute path to the HYPHA file, or null if not found
 */
export function findBiomeHypha(cultivationDir: string, biome: string): string | null {
  const hyphaeDir = path.join(cultivationDir, "hyphae");

  // Convert biome to upper-case for HYPHA filename
  const upperBiome = biome.toUpperCase().replace(/-/g, "-");

  // Try HYPHA-<BIOME>.md first (new convention)
  const newPath = path.join(hyphaeDir, `HYPHA-${upperBiome}.md`);
  if (fs.existsSync(newPath)) {
    return newPath;
  }

  // Try HYPHA-<BIOME>-AGENT.md (legacy convention)
  const legacyPath = path.join(hyphaeDir, `HYPHA-${upperBiome}-AGENT.md`);
  if (fs.existsSync(legacyPath)) {
    return legacyPath;
  }

  return null;
}

/**
 * Parse a biome HYPHA file to extract scope, deliverables, and acceptance criteria.
 *
 * @param hyphaPath - Absolute path to the HYPHA file
 * @param biome - The biome id
 * @returns Parsed BiomeHyphaInfo
 */
export function parseBiomeHypha(hyphaPath: string, biome: string): BiomeHyphaInfo {
  const content = fs.readFileSync(hyphaPath, "utf-8");
  const lines = content.split("\n");

  let scope = "";
  const deliverables: string[] = [];
  const acceptanceCriteria: string[] = [];

  // Parse SCOPE from CACHE HEADER
  // Format: - **SCOPE:** <one-line description>
  for (const line of lines) {
    const scopeMatch = line.match(/^-\s*\*\*SCOPE:\*\*\s*(.+)$/i);
    if (scopeMatch) {
      scope = scopeMatch[1].trim();
      break;
    }
  }

  // Parse deliverables from "## Deliverables by leaf" section
  // Looking for "- File:" lines in the sub-leaf sections
  let inDeliverablesSection = false;
  for (const line of lines) {
    if (line.match(/^##\s*Deliverables/i)) {
      inDeliverablesSection = true;
      continue;
    }
    // Exit when we hit another top-level section
    if (inDeliverablesSection && line.match(/^##\s+[^#]/)) {
      inDeliverablesSection = false;
    }
    if (inDeliverablesSection) {
      // Match "- File: path" or "- File(s): path" patterns
      const fileMatch = line.match(/^-\s*File(?:s)?:\s*`?([^`\n]+)`?/i);
      if (fileMatch) {
        deliverables.push(fileMatch[1].trim());
      }
    }
  }

  // Parse acceptance criteria from "## Acceptance criteria" section
  let inAcceptanceCriteria = false;
  for (const line of lines) {
    if (line.match(/^##\s*Acceptance criteria/i)) {
      inAcceptanceCriteria = true;
      continue;
    }
    // Exit when we hit another top-level section
    if (inAcceptanceCriteria && line.match(/^##\s+[^#]/)) {
      inAcceptanceCriteria = false;
    }
    if (inAcceptanceCriteria) {
      // Match bullet points (- item or * item)
      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        acceptanceCriteria.push(bulletMatch[1].trim());
      }
    }
  }

  return {
    biomeId: biome,
    scope: scope || `Tests for the ${biome} biome`,
    deliverables,
    acceptanceCriteria,
  };
}

/**
 * Generate the HYPHA-TEST-<biome>.md content per NUTRIENTS §6.
 *
 * @param info - Parsed biome HYPHA info
 * @returns Full markdown content for the tester HYPHA stub
 */
export function generateTesterHypha(info: BiomeHyphaInfo): string {
  const testerId = `tester.${info.biomeId}`;

  // Build INPUTS from deliverables (these are the files the tester will verify)
  const inputs = info.deliverables.length > 0
    ? info.deliverables.join(", ")
    : "NUTRIENTS.md, hyphae/HYPHA-" + info.biomeId.toUpperCase().replace(/-/g, "-") + ".md";

  // Build assertion TODOs from acceptance criteria
  const assertionTodos = info.acceptanceCriteria.length > 0
    ? info.acceptanceCriteria.map((c, i) => `- [ ] TODO: Assert that: ${c}`).join("\n")
    : `- [ ] TODO: Add assertions for the ${info.biomeId} biome`;

  return `# HYPHA-TEST — ${testerId}

## CACHE HEADER
- **TESTER_ID:** ${testerId}
- **MIRRORS_BIOME:** ${info.biomeId}
- **SCOPE:** ${info.scope}
- **INPUTS:** ${inputs}
- **TOOLS:** Read, Bash

## Assertions
<!-- Convert each acceptance criterion from the biome HYPHA into a testable assertion.
     Each assertion should have a deterministic pass/fail condition.
     The tester will emit a Finding if any assertion fails. -->

${assertionTodos}

## Repro recipe
<!-- Ordered commands/actions the tester runs to verify assertions.
     These become finding.repro_steps when an assertion fails. -->

- [ ] TODO: Define the reproduction steps for this tester

## Suggested fix template
<!-- Template text the tester uses as a starting point for finding.suggested_fix.
     Should guide the re-plant leaf toward the correct solution. -->

TODO: Describe how to fix failures detected by this tester.
`;
}

/**
 * Scaffold a HYPHA-TEST-<biome>.md file from an existing biome HYPHA.
 *
 * @param cultivationDir - Path to the cultivation directory
 * @param biome - The biome id to scaffold a tester for
 * @param options - Options (force to overwrite existing)
 * @returns Path to the created file
 * @throws ScaffoldTesterError if biome HYPHA not found or file already exists
 */
export function scaffoldTester(
  cultivationDir: string,
  biome: string,
  options: { force?: boolean } = {}
): string {
  // Find the biome HYPHA
  const hyphaPath = findBiomeHypha(cultivationDir, biome);
  if (!hyphaPath) {
    throw new ScaffoldTesterError(
      `Biome HYPHA not found for "${biome}". Expected at:\n` +
      `  hyphae/HYPHA-${biome.toUpperCase().replace(/-/g, "-")}.md\n` +
      `  or hyphae/HYPHA-${biome.toUpperCase().replace(/-/g, "-")}-AGENT.md`
    );
  }

  // Check if tester HYPHA already exists
  const outputPath = path.join(
    cultivationDir,
    "hyphae",
    `HYPHA-TEST-${biome}.md`
  );

  if (fs.existsSync(outputPath) && !options.force) {
    throw new ScaffoldTesterError(
      `HYPHA-TEST-${biome}.md already exists. Use --force to overwrite (not yet implemented).`
      // TODO: Implement --force flag in the CLI layer when needed
    );
  }

  // Parse the biome HYPHA
  const info = parseBiomeHypha(hyphaPath, biome);

  // Generate the tester HYPHA content
  const content = generateTesterHypha(info);

  // Ensure hyphae directory exists
  const hyphaeDir = path.dirname(outputPath);
  fs.mkdirSync(hyphaeDir, { recursive: true });

  // Write the file
  fs.writeFileSync(outputPath, content, "utf-8");

  return outputPath;
}
