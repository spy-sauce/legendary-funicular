// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Security types — shared across scanners, registry, and audit integration.
// See docs/superpowers/specs/2026-05-08-security-section-h-design.md.

export const SECURITY_TIERS = ['demo', 'startup', 'regulated'] as const;
export type SecurityTier = typeof SECURITY_TIERS[number];

export const TIER_RANK: Record<SecurityTier, number> = {
  demo: 0,
  startup: 1,
  regulated: 2,
};

export function isSecurityTier(s: unknown): s is SecurityTier {
  return typeof s === 'string' && (SECURITY_TIERS as readonly string[]).includes(s);
}

/** Tier marker on a §H rule. always-block bypasses tier ordering. */
export type RuleTier = SecurityTier | 'always-block';

/** Severity assigned to a finding after tier modulation + allowlist filter. */
export type Severity = 'block' | 'advisory' | 'allowlisted';

/** A single security finding produced by a scanner. */
export interface Finding {
  /** Stable rule identifier from §H (e.g., "H.1.1"). */
  ruleId: string;
  /** Tier marker carried on the rule. */
  ruleTier: RuleTier;
  /** Severity AFTER tier modulation + allowlist filter is applied. */
  severity: Severity;
  /** Source location: "path:line" or just "path". */
  file: string;
  /** Matched text or pattern, optionally redacted in reports. */
  match?: string;
  /** Stack-tag if rule is stack-specific (e.g., "expo-supabase"). */
  stackTag?: string;
  /** Allowlist entry that matched, if severity is "allowlisted". */
  allowlistedBy?: SecurityAllowlistEntry;
}

/** Entry in mycelium.yaml's organism.security_allowlist array. */
export interface SecurityAllowlistEntry {
  /** Rule ID this entry suppresses (e.g., "H.1.4"). */
  rule: string;
  /** File glob (advisory rules only). When omitted, allowlist is per-match. */
  pattern?: string;
  /** Free-text justification, surfaced in audit reports. */
  reason: string;
  /** ISO date string (YYYY-MM-DD). After this date the entry is treated as expired. */
  expires: string;
}
