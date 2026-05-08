import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanH_1_1_HardcodedSecrets,
  scanH_1_2_DotenvIgnored,
  scanH_1_3_ServiceRoleNotInClient,
  scanH_2_1_OAuthPKCE,
  scanH_2_2_SecureTokenStorage,
  scanH_2_3_AutoRefreshToken,
  scanH_3_1_RLSEnabled,
  scanH_3_2_NoAnonSelectStar,
  scanH_4_2_NoPIIInLogs,
  scanH_4_4_PIIColumnsAnnotated,
} from './scanners.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.resolve(__dirname, 'fixtures');

describe('scanH_1_1_HardcodedSecrets', () => {
  it('flags real keys in bad fixtures', () => {
    const findings = scanH_1_1_HardcodedSecrets(path.join(FIXTURES, 'H.1.1', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('H.1.1');
    expect(findings[0].ruleTier).toBe('always-block');
  });

  it('does not flag placeholder fallbacks in good fixtures', () => {
    const findings = scanH_1_1_HardcodedSecrets(path.join(FIXTURES, 'H.1.1', 'good'));
    expect(findings).toEqual([]);
  });
});

describe('scanH_1_2_DotenvIgnored', () => {
  it('returns no findings when .env is in .gitignore', () => {
    const findings = scanH_1_2_DotenvIgnored(path.join(FIXTURES, 'H.1.2', 'good'));
    expect(findings).toEqual([]);
  });

  it('flags missing .env in .gitignore', () => {
    const findings = scanH_1_2_DotenvIgnored(path.join(FIXTURES, 'H.1.2', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('H.1.2');
    expect(findings[0].ruleTier).toBe('demo');
  });
});

describe('scanH_1_3_ServiceRoleNotInClient', () => {
  it('returns no findings when service_role not in src/', () => {
    expect(scanH_1_3_ServiceRoleNotInClient(path.join(FIXTURES, 'H.1.3', 'good'))).toEqual([]);
  });

  it('flags service_role usage in src/', () => {
    const findings = scanH_1_3_ServiceRoleNotInClient(path.join(FIXTURES, 'H.1.3', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('H.1.3');
    expect(findings[0].ruleTier).toBe('always-block');
  });
});

describe('scanH_2_1_OAuthPKCE', () => {
  it('returns no findings when responseType is code', () => {
    expect(scanH_2_1_OAuthPKCE(path.join(FIXTURES, 'H.2.1', 'good'))).toEqual([]);
  });

  it('flags implicit grant (responseType: token)', () => {
    const findings = scanH_2_1_OAuthPKCE(path.join(FIXTURES, 'H.2.1', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('H.2.1');
  });
});

describe('scanH_2_2_SecureTokenStorage', () => {
  it('returns no findings when storage is secureStorageAdapter', () => {
    expect(scanH_2_2_SecureTokenStorage(path.join(FIXTURES, 'H.2.2', 'good'))).toEqual([]);
  });

  it('flags raw AsyncStorage as auth.storage', () => {
    const findings = scanH_2_2_SecureTokenStorage(path.join(FIXTURES, 'H.2.2', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('H.2.2');
    expect(findings[0].stackTag).toBe('expo-supabase');
  });
});

describe('scanH_2_3_AutoRefreshToken', () => {
  it('returns no findings when autoRefreshToken: true is present', () => {
    expect(scanH_2_3_AutoRefreshToken(path.join(FIXTURES, 'H.2.3', 'good'))).toEqual([]);
  });

  it('flags createClient without autoRefreshToken: true', () => {
    const findings = scanH_2_3_AutoRefreshToken(path.join(FIXTURES, 'H.2.3', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('H.2.3');
    expect(findings[0].ruleTier).toBe('startup');
  });
});

describe('scanH_3_1_RLSEnabled', () => {
  it('returns no findings when every table has RLS', () => {
    expect(scanH_3_1_RLSEnabled(path.join(FIXTURES, 'H.3.1', 'good'))).toEqual([]);
  });

  it('flags tables missing ENABLE ROW LEVEL SECURITY', () => {
    const findings = scanH_3_1_RLSEnabled(path.join(FIXTURES, 'H.3.1', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('H.3.1');
    expect(findings[0].ruleTier).toBe('always-block');
    expect(findings[0].match).toContain('bookings');
  });
});

describe('scanH_3_2_NoAnonSelectStar', () => {
  it('returns no findings when grants are column-restricted', () => {
    expect(scanH_3_2_NoAnonSelectStar(path.join(FIXTURES, 'H.3.2', 'good'))).toEqual([]);
  });

  it('flags unrestricted GRANT SELECT TO anon', () => {
    const findings = scanH_3_2_NoAnonSelectStar(path.join(FIXTURES, 'H.3.2', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('H.3.2');
  });
});

describe('scanH_4_2_NoPIIInLogs', () => {
  it('returns no findings when logs only contain user_id', () => {
    expect(scanH_4_2_NoPIIInLogs(path.join(FIXTURES, 'H.4.2', 'good'))).toEqual([]);
  });

  it('flags console.log/analytics.track with PII identifiers', () => {
    const findings = scanH_4_2_NoPIIInLogs(path.join(FIXTURES, 'H.4.2', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0].ruleId).toBe('H.4.2');
    expect(findings[0].ruleTier).toBe('demo');
  });
});

describe('scanH_4_4_PIIColumnsAnnotated', () => {
  it('returns no findings when PII columns carry @pii comments', () => {
    expect(scanH_4_4_PIIColumnsAnnotated(path.join(FIXTURES, 'H.4.4', 'good'))).toEqual([]);
  });

  it('flags PII column names without @pii annotation', () => {
    const findings = scanH_4_4_PIIColumnsAnnotated(path.join(FIXTURES, 'H.4.4', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0].ruleId).toBe('H.4.4');
    expect(findings[0].ruleTier).toBe('startup');
  });
});
