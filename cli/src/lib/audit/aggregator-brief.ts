// aggregator-brief.ts — composeBriefFix for audit-run
//
// Scope: prepend only_biomes + Active findings + audit_baseline to brief.md
// Contract: NUTRIENTS.md §5 (aggregator → brief composition contract)
//
// Part of audit.aggregator.brief leaf.

import type { Finding } from "./findings.js";
import type { AggregatedFindings } from "./aggregator.js";

/**
 * Compose the brief-fix.md for a re-plant cycle.
 *
 * The brief-fix.md is the input to `mycelium cultivate --only-biome` during
 * a heal-loop iteration. It contains:
 *   - YAML frontmatter with only_biomes and audit_baseline
 *   - The original brief verbatim
 *   - Active findings as MUST-line acceptance criteria
 *   - Informational (minor) findings as notes
 *
 * @param originalBrief - Full text of the cultivation's brief.md
 * @param aggregated - Grouped findings from aggregate()
 * @param auditBaselinePath - Path to prior findings.jsonl (null on iteration 0)
 * @returns Full text of brief-fix.md
 */
export function composeBriefFix(
  originalBrief: string,
  aggregated: AggregatedFindings,
  auditBaselinePath: string | null
): string {
  const parts: string[] = [];

  // 1. YAML frontmatter
  parts.push(buildFrontmatter(aggregated, auditBaselinePath));

  // 2. Section header
  parts.push('# Re-plant brief — audit-run autofix iteration');
  parts.push('');

  // 3. Original brief verbatim
  parts.push(originalBrief);
  parts.push('');

  // 4. Active findings (critical + major biomes)
  const activeFindingsSection = buildActiveFindingsSection(aggregated);
  if (activeFindingsSection) {
    parts.push(activeFindingsSection);
  }

  // 5. Informational (minor) findings
  const minorSection = buildMinorFindingsSection(aggregated);
  if (minorSection) {
    parts.push(minorSection);
  }

  return parts.join('\n');
}

/**
 * Build YAML frontmatter with only_biomes and audit_baseline.
 */
function buildFrontmatter(
  aggregated: AggregatedFindings,
  auditBaselinePath: string | null
): string {
  // only_biomes = criticalBiomes ∪ majorBiomes, alphabetical
  const onlyBiomes = [
    ...aggregated.criticalBiomes,
    ...aggregated.majorBiomes,
  ].sort();

  const lines: string[] = [];
  lines.push('---');
  lines.push(`only_biomes: [${onlyBiomes.join(', ')}]`);
  lines.push(`audit_baseline: ${auditBaselinePath ?? 'null'}`);
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

/**
 * Build the "Active findings — re-plant scope" section.
 * Contains MUST lines for critical and major findings.
 */
function buildActiveFindingsSection(aggregated: AggregatedFindings): string | null {
  const activeBiomes = [
    ...aggregated.criticalBiomes,
    ...aggregated.majorBiomes,
  ].sort();

  if (activeBiomes.length === 0) {
    return null;
  }

  const lines: string[] = [];
  lines.push('## Active findings — re-plant scope');
  lines.push('');

  for (const biome of activeBiomes) {
    const findings = aggregated.byBiome[biome] || [];
    // Filter to only critical and major (per contract: minor never as MUST lines)
    const activeFindings = findings.filter(
      (f) => f.severity === 'critical' || f.severity === 'major'
    );

    if (activeFindings.length === 0) {
      continue;
    }

    lines.push(`### ${biome}`);

    for (const finding of activeFindings) {
      const idShort = shortId(finding.id);
      lines.push(`- **MUST** ${finding.summary} (audit-run finding ${idShort}).`);
      lines.push(`  Suggested fix: ${finding.suggested_fix}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build the "Informational (minor) findings" section.
 * These are notes only — never MUST lines.
 */
function buildMinorFindingsSection(aggregated: AggregatedFindings): string | null {
  // Collect all minor findings across all biomes
  const minorFindings: Array<{ biome: string; finding: Finding }> = [];

  // Include minor findings from all biomes, not just minorOnlyBiomes
  const allBiomes = Object.keys(aggregated.byBiome).sort();

  for (const biome of allBiomes) {
    const findings = aggregated.byBiome[biome] || [];
    for (const finding of findings) {
      if (finding.severity === 'minor') {
        minorFindings.push({ biome, finding });
      }
    }
  }

  if (minorFindings.length === 0) {
    return null;
  }

  const lines: string[] = [];
  lines.push('## Informational (minor) findings');
  lines.push('');

  for (const { biome, finding } of minorFindings) {
    const idShort = shortId(finding.id);
    lines.push(`- ${biome}: ${finding.summary} (${idShort})`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Shorten a finding ID to first 8 hex chars.
 * IDs are sha256 hex strings (64 chars).
 */
function shortId(id: string): string {
  return id.slice(0, 8);
}
