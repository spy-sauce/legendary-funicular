// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Scanner registry: maps rule ID → scanner function.
// At framework build time, assertRegistryConsistency() verifies that every
// rule ID mentioned in any stack appendix's securityRules has a scanner
// registered, and vice versa. Build fails on mismatch.

import type { Finding } from './types.js';
import type { StackPreset } from '../stacks/index.js';

export type ScannerFn = (cwd: string) => Promise<Finding[]> | Finding[];

/** Registry of rule ID → scanner. Populated by registerScanner() calls in scanners.ts. */
export const SCANNER_REGISTRY: Record<string, ScannerFn> = {};

/** Register a scanner for a rule ID. Called once per rule from scanners.ts. */
export function registerScanner(ruleId: string, fn: ScannerFn): void {
  if (SCANNER_REGISTRY[ruleId]) {
    throw new Error(`Duplicate scanner registration for ${ruleId}`);
  }
  SCANNER_REGISTRY[ruleId] = fn;
}

export function getScanner(ruleId: string): ScannerFn | undefined {
  return SCANNER_REGISTRY[ruleId];
}

export function listRegisteredRuleIds(): string[] {
  return Object.keys(SCANNER_REGISTRY).sort();
}

/** Extract rule IDs (e.g., "H.1.1") from a stack appendix's securityRules text. */
function extractRuleIdsFromAppendix(securityRules: string): Set<string> {
  const ids = new Set<string>();
  const re = /^#####\s+(H\.\d+\.\d+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(securityRules)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

/**
 * Build-time consistency check. For each stack, every rule ID in the
 * appendix's securityRules MUST have a corresponding scanner (with two
 * exceptions: H.4.1 is contract-vs-contract; H.1.5/H.2.4/H.3.5/H.4.5 are
 * regulated-tier documentation rules with no source signature). Every
 * scanner in the registry MUST appear in at least one appendix.
 */
export function assertRegistryConsistency(
  stacks: Record<string, StackPreset>
): void {
  // Rules that are intentionally documentation-only (no scanner expected).
  // These are typically doc-vs-doc checks (verify a section exists in README
  // or CLAUDE.md) or contract-vs-contract checks (verify NUTRIENTS contains
  // a vocabulary block). The audit prompt handles them; no source-scan needed.
  const DOCUMENTATION_ONLY = new Set<string>([
    'H.1.4',  // secret manager named in README/CLAUDE.md
    'H.1.5',  // secret rotation runbook (regulated)
    'H.2.4',  // short-lived tokens documented in README (regulated)
    'H.3.3',  // explicit policies per role — heuristic, deferred to v2
    'H.3.4',  // service_role only in server functions — paired with always-block H.1.3
    'H.3.5',  // PII audit trail (regulated, paired with H.4.4 + DB triggers)
    'H.4.1',  // PII vocabulary defined (contract-vs-contract via audit prompt)
    'H.4.3',  // error message PII sanitization — heuristic, deferred to v2
    'H.4.5',  // PII access logging (regulated, doc-only)
  ]);

  const appendixIds = new Set<string>();
  for (const [name, stack] of Object.entries(stacks)) {
    const ids = extractRuleIdsFromAppendix(stack.contractAppendix.securityRules);
    for (const id of ids) appendixIds.add(id);
    // Per-stack: every appendix rule (minus doc-only) MUST be in registry.
    for (const id of ids) {
      if (DOCUMENTATION_ONLY.has(id)) continue;
      if (!SCANNER_REGISTRY[id]) {
        throw new Error(
          `Stack "${name}" mentions rule ${id} in §H but no scanner is registered. ` +
            `Add a scanner in cli/src/security/scanners.ts or mark ${id} documentation-only.`
        );
      }
    }
  }

  // Every registered scanner MUST appear in at least one appendix.
  for (const ruleId of Object.keys(SCANNER_REGISTRY)) {
    if (!appendixIds.has(ruleId)) {
      throw new Error(
        `Scanner ${ruleId} is registered but not mentioned in any stack appendix's securityRules. ` +
          `Either delete the scanner or add the rule to a stack.`
      );
    }
  }
}
