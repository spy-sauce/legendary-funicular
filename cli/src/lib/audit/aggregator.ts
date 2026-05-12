// Aggregator — pure function that groups findings by biome with deterministic ordering.
//
// Contract: NUTRIENTS.md §5 (aggregator → brief composition contract)
// Scope:    audit.aggregator.aggregate
//
// Pure function. No I/O. Stable ordering: biomes alphabetical, findings
// by severity (critical → major → minor) then by id (lexical).

import type { Finding, Severity } from "./findings.js";

/**
 * Aggregated findings grouped by biome, per NUTRIENTS §5.
 *
 * - byBiome: Record<string, Finding[]> — findings grouped by biome, deterministically sorted.
 * - criticalBiomes: biomes with ≥1 critical finding.
 * - majorBiomes: biomes with ≥1 major finding AND zero criticals.
 * - minorOnlyBiomes: biomes with only minor findings.
 */
export interface AggregatedFindings {
  byBiome: Record<string, Finding[]>;
  criticalBiomes: string[];
  majorBiomes: string[];
  minorOnlyBiomes: string[];
}

/**
 * Severity ordering: critical (0) < major (1) < minor (2).
 * Lower number = higher priority (sorted first).
 */
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
};

/**
 * Compare two findings for sorting.
 * Primary: severity (critical → major → minor).
 * Secondary: id (lexical, ascending).
 */
function compareFinding(a: Finding, b: Finding): number {
  const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (severityDiff !== 0) return severityDiff;
  return a.id.localeCompare(b.id);
}

/**
 * Determine the highest severity present in a list of findings.
 * Returns "minor" if the list is empty (defensive — should not occur in practice).
 */
function highestSeverity(findings: Finding[]): Severity {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "major")) return "major";
  return "minor";
}

/**
 * aggregate — pure function; deterministic ordering.
 *
 * Groups findings by biome. Within each biome, findings are sorted by severity
 * (critical → major → minor), then by id (lexical). Biomes are sorted alphabetically.
 *
 * Classification:
 * - A biome with ≥1 critical finding → criticalBiomes (even if it also has major/minor).
 * - A biome with ≥1 major finding and zero criticals → majorBiomes.
 * - A biome with only minor findings → minorOnlyBiomes.
 *
 * @param findings Array of Finding objects from testers.
 * @returns AggregatedFindings with deterministic ordering.
 */
export function aggregate(findings: Finding[]): AggregatedFindings {
  // Group by biome
  const byBiomeUnsorted: Record<string, Finding[]> = {};

  for (const finding of findings) {
    const biome = finding.biome;
    if (!byBiomeUnsorted[biome]) {
      byBiomeUnsorted[biome] = [];
    }
    byBiomeUnsorted[biome].push(finding);
  }

  // Sort findings within each biome, then build the sorted byBiome record
  const biomeNames = Object.keys(byBiomeUnsorted).sort();
  const byBiome: Record<string, Finding[]> = {};

  const criticalBiomes: string[] = [];
  const majorBiomes: string[] = [];
  const minorOnlyBiomes: string[] = [];

  for (const biome of biomeNames) {
    const biomFindings = byBiomeUnsorted[biome].slice().sort(compareFinding);
    byBiome[biome] = biomFindings;

    // Classify this biome by its highest severity
    const highest = highestSeverity(biomFindings);
    switch (highest) {
      case "critical":
        criticalBiomes.push(biome);
        break;
      case "major":
        majorBiomes.push(biome);
        break;
      case "minor":
        minorOnlyBiomes.push(biome);
        break;
    }
  }

  return {
    byBiome,
    criticalBiomes,
    majorBiomes,
    minorOnlyBiomes,
  };
}
