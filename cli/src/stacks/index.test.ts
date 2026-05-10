import { describe, it, expect } from 'vitest';
import { renderContractAppendix } from './index.js';
import type { ContractAppendix } from './index.js';

const stub: ContractAppendix = {
  preamble: 'p',
  dependencyManifest: 'd',
  primitiveProps: 'pp',
  baselineOwnership: 'b',
  barrelOwnership: 'bo',
  allowlistedIdentifiers: 'a',
  styleSystemRules: 's',
  screenOwnershipMatrix: 'so',
  securityRules: 'TEST_SECURITY_RULES_CONTENT',
};

describe('ContractAppendix', () => {
  it('requires a securityRules field', () => {
    expect(stub.securityRules).toBe('TEST_SECURITY_RULES_CONTENT');
  });
});

describe('renderContractAppendix', () => {
  it('renders §H heading and securityRules content', () => {
    const out = renderContractAppendix(stub);
    expect(out).toMatch(/### H\. Security Rules/);
    expect(out).toContain('TEST_SECURITY_RULES_CONTENT');
  });
});
