import { describe, it, expect } from 'vitest';
import { SCANNER_REGISTRY, getScanner, listRegisteredRuleIds, assertRegistryConsistency } from './registry.js';

describe('scanner registry', () => {
  it('exports SCANNER_REGISTRY as a record', () => {
    expect(typeof SCANNER_REGISTRY).toBe('object');
  });

  it('getScanner returns undefined for unknown rule', () => {
    expect(getScanner('H.99.99')).toBeUndefined();
  });

  it('listRegisteredRuleIds returns sorted IDs', () => {
    const ids = listRegisteredRuleIds();
    expect(Array.isArray(ids)).toBe(true);
    expect([...ids].sort()).toEqual(ids);
  });

  it('exports assertRegistryConsistency as a function', () => {
    expect(typeof assertRegistryConsistency).toBe('function');
  });

  // The end-to-end consistency check (registry vs all stack appendices) lives
  // in cli/scripts/check-registry.ts and runs at build time AFTER scanners.ts
  // has been side-effect-imported. Testing it here would require importing
  // scanners.ts first, which would cause circular concerns; the build-time
  // check is the authoritative gate.
});
