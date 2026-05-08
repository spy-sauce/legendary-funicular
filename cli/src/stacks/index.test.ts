import { describe, it, expect } from 'vitest';
import type { ContractAppendix } from './index.js';

describe('ContractAppendix', () => {
  it('requires a securityRules field', () => {
    const minimal: ContractAppendix = {
      preamble: 'p',
      dependencyManifest: 'd',
      primitiveProps: 'pp',
      baselineOwnership: 'b',
      barrelOwnership: 'bo',
      allowlistedIdentifiers: 'a',
      styleSystemRules: 's',
      screenOwnershipMatrix: 'so',
      securityRules: 'sec',
    };
    expect(minimal.securityRules).toBe('sec');
  });
});
