import { describe, it, expect } from 'vitest';
import {
  type Finding,
  TIER_RANK,
  SECURITY_TIERS,
  isSecurityTier,
} from './types.js';

describe('security types', () => {
  it('TIER_RANK orders demo < startup < regulated', () => {
    expect(TIER_RANK.demo).toBeLessThan(TIER_RANK.startup);
    expect(TIER_RANK.startup).toBeLessThan(TIER_RANK.regulated);
  });

  it('SECURITY_TIERS lists all three tiers in order', () => {
    expect(SECURITY_TIERS).toEqual(['demo', 'startup', 'regulated']);
  });

  it('isSecurityTier rejects unknown values', () => {
    expect(isSecurityTier('demo')).toBe(true);
    expect(isSecurityTier('startup')).toBe(true);
    expect(isSecurityTier('regulated')).toBe(true);
    expect(isSecurityTier('production')).toBe(false);
    expect(isSecurityTier(undefined)).toBe(false);
  });

  it('Finding shape is constructible', () => {
    const f: Finding = {
      ruleId: 'H.1.1',
      file: 'src/foo.ts:42',
      ruleTier: 'always-block',
      severity: 'block',
    };
    expect(f.ruleId).toBe('H.1.1');
  });
});
