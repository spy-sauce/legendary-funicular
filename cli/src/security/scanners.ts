// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Source-scanning security audits. Each scanner returns Finding[] for
// matches; the audit subcommand applies tier modulation + allowlist filter
// before reporting. Scanners are registered with the registry so the
// build-time consistency check can verify every rule has a scanner.
//
// v1: regex-based. v2 (post-run-4): TS AST + SQL parser for stricter coverage.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Finding } from './types.js';
import { registerScanner } from './registry.js';

const GREP_MAX_BUFFER = 100 * 1024 * 1024;

/** Run grep, return matching lines as "path:line:match" strings. Empty array on no match. */
function grepLines(args: string[], cwd: string): string[] {
  try {
    const out = execFileSync('grep', args, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: GREP_MAX_BUFFER,
    });
    return out.split('\n').filter((l) => l.length > 0);
  } catch (err: any) {
    // grep exits 1 when no matches — that's not an error here.
    if (err.status === 1) return [];
    throw err;
  }
}

// ───────── H.1.1 — No hardcoded secrets in committed code ─────────

const HARDCODED_SECRET_PATTERN =
  'sk_live_|sk_test_|eyJ[A-Za-z0-9]{30,}|service_role|AKIA[0-9A-Z]{16}';

export function scanH_1_1_HardcodedSecrets(cwd: string): Finding[] {
  const targets = ['src', 'supabase'].filter((d) =>
    fs.existsSync(path.join(cwd, d))
  );
  if (targets.length === 0) return [];

  const lines = grepLines(['-rEn', HARDCODED_SECRET_PATTERN, ...targets], cwd);

  // Filter out exempt placeholder lines.
  const real = lines.filter((l) => !l.includes('placeholder'));

  return real.map((line): Finding => {
    const [filePart, lineNumPart, ...matchParts] = line.split(':');
    return {
      ruleId: 'H.1.1',
      ruleTier: 'always-block',
      severity: 'block',
      file: `${filePart}:${lineNumPart}`,
      match: matchParts.join(':').trim().slice(0, 80),
    };
  });
}

registerScanner('H.1.1', scanH_1_1_HardcodedSecrets);

// ───────── H.1.2 — .env gitignored ─────────

export function scanH_1_2_DotenvIgnored(cwd: string): Finding[] {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return [
      {
        ruleId: 'H.1.2',
        ruleTier: 'demo',
        severity: 'advisory',
        file: '.gitignore',
        match: 'file does not exist',
      },
    ];
  }
  const lines = fs.readFileSync(gitignorePath, 'utf-8').split('\n');
  const hasEnv = lines.some((l) => {
    const trimmed = l.trim();
    return trimmed === '.env' || trimmed === '.env.*' || trimmed === '*.env';
  });
  if (hasEnv) return [];
  return [
    {
      ruleId: 'H.1.2',
      ruleTier: 'demo',
      severity: 'advisory',
      file: '.gitignore',
      match: '.env not listed',
    },
  ];
}

registerScanner('H.1.2', scanH_1_2_DotenvIgnored);

// ───────── H.1.3 — service_role keys never reach client code ─────────

export function scanH_1_3_ServiceRoleNotInClient(cwd: string): Finding[] {
  const srcDir = path.join(cwd, 'src');
  if (!fs.existsSync(srcDir)) return [];

  const lines = grepLines(['-rEn', 'service_role', 'src'], cwd);
  return lines.map((line): Finding => {
    const [filePart, lineNumPart, ...matchParts] = line.split(':');
    return {
      ruleId: 'H.1.3',
      ruleTier: 'always-block',
      severity: 'block',
      file: `${filePart}:${lineNumPart}`,
      match: matchParts.join(':').trim().slice(0, 80),
    };
  });
}

registerScanner('H.1.3', scanH_1_3_ServiceRoleNotInClient);

// ───────── H.2.1 — OAuth PKCE only ─────────

export function scanH_2_1_OAuthPKCE(cwd: string): Finding[] {
  const srcDir = path.join(cwd, 'src');
  if (!fs.existsSync(srcDir)) return [];

  const lines = grepLines(['-rEn', "responseType:\\s*['\"]token['\"]", 'src'], cwd);
  return lines.map((line): Finding => {
    const [filePart, lineNumPart, ...matchParts] = line.split(':');
    return {
      ruleId: 'H.2.1',
      ruleTier: 'demo',
      severity: 'advisory',
      file: `${filePart}:${lineNumPart}`,
      match: matchParts.join(':').trim().slice(0, 80),
    };
  });
}

registerScanner('H.2.1', scanH_2_1_OAuthPKCE);

// ───────── H.2.2 — secureStorageAdapter for Supabase auth, not raw AsyncStorage ─────────

export function scanH_2_2_SecureTokenStorage(cwd: string): Finding[] {
  const srcDir = path.join(cwd, 'src');
  if (!fs.existsSync(srcDir)) return [];

  const lines = grepLines(['-rEn', 'storage:\\s*AsyncStorage', 'src'], cwd);
  return lines.map((line): Finding => {
    const [filePart, lineNumPart, ...matchParts] = line.split(':');
    return {
      ruleId: 'H.2.2',
      ruleTier: 'demo',
      severity: 'advisory',
      stackTag: 'expo-supabase',
      file: `${filePart}:${lineNumPart}`,
      match: matchParts.join(':').trim().slice(0, 80),
    };
  });
}

registerScanner('H.2.2', scanH_2_2_SecureTokenStorage);

// ───────── H.2.3 — autoRefreshToken: true ─────────

export function scanH_2_3_AutoRefreshToken(cwd: string): Finding[] {
  const srcDir = path.join(cwd, 'src');
  if (!fs.existsSync(srcDir)) return [];

  const createClientLines = grepLines(['-rEn', 'createClient\\(', 'src'], cwd);
  if (createClientLines.length === 0) return [];

  const findings: Finding[] = [];
  for (const line of createClientLines) {
    const [filePart, lineNumStr] = line.split(':');
    const lineNum = parseInt(lineNumStr, 10);
    const fullPath = path.join(cwd, filePart);
    if (!fs.existsSync(fullPath)) continue;
    const allLines = fs.readFileSync(fullPath, 'utf-8').split('\n');
    const window = allLines.slice(lineNum - 1, lineNum + 10).join('\n');
    if (!/autoRefreshToken:\s*true/.test(window)) {
      findings.push({
        ruleId: 'H.2.3',
        ruleTier: 'startup',
        severity: 'block',
        file: `${filePart}:${lineNumStr}`,
        match: 'createClient without autoRefreshToken: true',
      });
    }
  }
  return findings;
}

registerScanner('H.2.3', scanH_2_3_AutoRefreshToken);

// ───────── H.3.1 — every table has RLS enabled ─────────

export function scanH_3_1_RLSEnabled(cwd: string): Finding[] {
  const migrationsDir = path.join(cwd, 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) return [];

  const findings: Finding[] = [];
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');

    const createRe = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/gi;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(content)) !== null) {
      const tableName = m[1];
      const rlsRe = new RegExp(
        `ALTER\\s+TABLE\\s+["']?${tableName}["']?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i'
      );
      if (!rlsRe.test(content)) {
        const lineNum = content.slice(0, m.index).split('\n').length;
        findings.push({
          ruleId: 'H.3.1',
          ruleTier: 'always-block',
          severity: 'block',
          file: `supabase/migrations/${file}:${lineNum}`,
          match: `table "${tableName}" has no ENABLE ROW LEVEL SECURITY`,
        });
      }
    }
  }

  return findings;
}

registerScanner('H.3.1', scanH_3_1_RLSEnabled);

// ───────── H.3.2 — no unrestricted SELECT to anon ─────────

export function scanH_3_2_NoAnonSelectStar(cwd: string): Finding[] {
  const migrationsDir = path.join(cwd, 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) return [];

  const findings: Finding[] = [];
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const re = /GRANT\s+SELECT\s+ON\s+\w+\s+TO\s+anon/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      findings.push({
        ruleId: 'H.3.2',
        ruleTier: 'demo',
        severity: 'advisory',
        file: `supabase/migrations/${file}:${lineNum}`,
        match: m[0].slice(0, 80),
      });
    }
  }

  return findings;
}

registerScanner('H.3.2', scanH_3_2_NoAnonSelectStar);

// ───────── H.4.2 — no PII in logs ─────────

const PII_IDENTIFIERS = [
  'email',
  'phone',
  'address',
  'ssn',
  'password',
  'token',
  'api_key',
  'apikey',
];

export function scanH_4_2_NoPIIInLogs(cwd: string): Finding[] {
  const srcDir = path.join(cwd, 'src');
  if (!fs.existsSync(srcDir)) return [];

  const findings: Finding[] = [];
  const piiAlt = PII_IDENTIFIERS.join('|');
  const re = `(console\\.(log|warn|error|info)|analytics\\.track|Sentry\\.captureException)\\([^)]*\\b(${piiAlt})\\b`;
  const lines = grepLines(['-rEn', re, 'src'], cwd);
  for (const line of lines) {
    const [filePart, lineNumStr, ...matchParts] = line.split(':');
    findings.push({
      ruleId: 'H.4.2',
      ruleTier: 'demo',
      severity: 'advisory',
      file: `${filePart}:${lineNumStr}`,
      match: matchParts.join(':').trim().slice(0, 80),
    });
  }
  return findings;
}

registerScanner('H.4.2', scanH_4_2_NoPIIInLogs);

// ───────── H.4.4 — PII columns annotated ─────────

const PII_COLUMN_NAMES = [
  'email',
  'phone',
  'phone_number',
  'address',
  'street',
  'postal_code',
  'zip',
  'ssn',
  'national_id',
  'passport',
  'legal_name',
  'first_name',
  'last_name',
  'date_of_birth',
  'dob',
  'birthday',
  'lat',
  'latitude',
  'lng',
  'longitude',
];

export function scanH_4_4_PIIColumnsAnnotated(cwd: string): Finding[] {
  const migrationsDir = path.join(cwd, 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) return [];

  const findings: Finding[] = [];
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pii of PII_COLUMN_NAMES) {
        const colRe = new RegExp(`^\\s*${pii}\\s+`, 'i');
        if (colRe.test(line) && !/--\s*@pii/.test(line)) {
          findings.push({
            ruleId: 'H.4.4',
            ruleTier: 'startup',
            severity: 'block',
            file: `supabase/migrations/${file}:${i + 1}`,
            match: `column "${pii}" missing @pii annotation`,
          });
          break;
        }
      }
    }
  }

  return findings;
}

registerScanner('H.4.4', scanH_4_4_PIIColumnsAnnotated);
