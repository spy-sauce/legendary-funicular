# Section H — Framework-Level Security Contracts: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add framework-level security contracts to legendary-funicular as a new Section H in the contract appendix, with tiered enforcement (demo / startup / regulated), source-scanning audit gates, and lifecycle support for tier promotion.

**Architecture:** New `securityRules` field on `ContractAppendix` + tier flag on `mycelium plant` + deterministic source scanners that produce findings the audit agent triages. Three milestones, each independently shippable: M1 = data model + content; M2 = scanners + audit enforcement; M3 = lifecycle (`upgrade-tier`, downgrade detection, allowlist expiry).

**Tech Stack:** TypeScript (ES2022, NodeNext, strict), Claude Agent SDK, vitest (new test framework), commander, yaml, chalk.

**Spec:** `docs/superpowers/specs/2026-05-08-security-section-h-design.md`

---

## File map

**New:**
- `cli/vitest.config.ts` — vitest configuration
- `cli/src/security/types.ts` — `Finding`, `Severity`, `Tier`, `SecurityAllowlistEntry` types
- `cli/src/security/registry.ts` — rule ID → scanner mapping + build-time consistency check
- `cli/src/security/scanners.ts` — 8 scanner functions (one per source-scannable rule)
- `cli/src/security/scanners.test.ts` — unit tests per scanner
- `cli/src/security/fixtures/H.1.1/{good,bad}/*.ts` — test fixtures (and similar for H.1.2, H.1.3, H.2.1, H.2.2, H.3.1, H.3.2, H.4.2)
- `cli/src/commands/contracts.audit.test.ts` — tier modulation + allowlist tests

**Modified:**
- `cli/package.json` — add vitest devDep + test script
- `cli/src/stacks/index.ts` — add `securityRules` field to `ContractAppendix`, render in §H section
- `cli/src/stacks/appendix.expo-supabase.ts` — full §H content (preamble + 20 rule bodies)
- `cli/src/stacks/appendix.nextjs-fastapi-supabase.ts` — initial §H baseline
- `cli/src/commands/plant.ts` — `--security` flag with hard-fail-first / auto-resolve-subsequent behavior; planner prompt extension to record `security_tier` in mycelium.yaml
- `cli/src/commands/contracts.ts` — audit integration with findings collection, allowlist filter, tier modulation; new `upgrade-tier` subcommand; downgrade detection via git log

---

# M1 — Data model + content (12 tasks)

Goal: builds-clean framework with §H rendered into NUTRIENTS at plant time, but no enforcement yet (no scanners, no findings). Validates the contract surface end-to-end before adding teeth.

### Task 1: Set up vitest

**Files:**
- Modify: `cli/package.json`
- Create: `cli/vitest.config.ts`

- [ ] **Step 1: Add vitest devDep + test script**

Edit `cli/package.json`. Add to `devDependencies`:

```json
"vitest": "^2.0.0"
```

Add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create vitest config**

Create `cli/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10000,
  },
});
```

- [ ] **Step 3: Install**

```bash
cd cli && npm install --legacy-peer-deps
```

Expected: vitest added to node_modules, no peer-dep errors.

- [ ] **Step 4: Verify test runner works (no tests yet)**

```bash
cd cli && npm test
```

Expected: vitest runs, finds no tests, exits 0.

- [ ] **Step 5: Commit**

```bash
git add cli/package.json cli/package-lock.json cli/vitest.config.ts
git commit -m "[MYC] add vitest test framework"
```

---

### Task 2: Add `securityRules` field to `ContractAppendix` interface

**Files:**
- Modify: `cli/src/stacks/index.ts`

- [ ] **Step 1: Write failing test**

Create `cli/src/stacks/index.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd cli && npm test -- src/stacks/index.test.ts
```

Expected: FAIL with TS2353 (object literal may only specify known properties) — `securityRules` not in `ContractAppendix`.

- [ ] **Step 3: Add field to interface**

In `cli/src/stacks/index.ts`, edit the `ContractAppendix` interface, add at the end (after `screenOwnershipMatrix`):

```ts
  /**
   * Section H — Security Rules. Tiered enforcement (demo/startup/regulated)
   * with [always-block] catastrophic floor. Renders as §H of NUTRIENTS.md.
   * Contains universal rules + stack-specific addenda inline.
   */
  securityRules: string;
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd cli && npm test -- src/stacks/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/stacks/index.ts cli/src/stacks/index.test.ts
git commit -m "[MYC] add securityRules field to ContractAppendix"
```

---

### Task 3: Update `renderContractAppendix` to include §H

**Files:**
- Modify: `cli/src/stacks/index.ts`

- [ ] **Step 1: Write failing test**

Append to `cli/src/stacks/index.test.ts`:

```ts
import { renderContractAppendix } from './index.js';

describe('renderContractAppendix', () => {
  it('renders §H heading and securityRules content', () => {
    const appendix: ContractAppendix = {
      preamble: '',
      dependencyManifest: '',
      primitiveProps: '',
      baselineOwnership: '',
      barrelOwnership: '',
      allowlistedIdentifiers: '',
      styleSystemRules: '',
      screenOwnershipMatrix: '',
      securityRules: 'TEST_SECURITY_RULES_CONTENT',
    };
    const out = renderContractAppendix(appendix);
    expect(out).toMatch(/### H\. Security Rules/);
    expect(out).toContain('TEST_SECURITY_RULES_CONTENT');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd cli && npm test -- src/stacks/index.test.ts
```

Expected: FAIL — output does not contain "### H. Security Rules" yet.

- [ ] **Step 3: Update renderer**

In `cli/src/stacks/index.ts`, find `renderContractAppendix`. Locate the existing `screenOwnershipMatrix` rendering at the end of the array passed to `.join("\n")`. Add §H after §G:

```ts
    "### G. Screen Ownership Matrix (universal rules — planner appends per-route table)",
    "",
    appendix.screenOwnershipMatrix,
    "",
    "### H. Security Rules",
    "",
    appendix.securityRules,
    "",
  ].join("\n");
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd cli && npm test -- src/stacks/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/stacks/index.ts cli/src/stacks/index.test.ts
git commit -m "[MYC] render §H section in contract appendix"
```

---

### Task 4: Draft H.1.x rule bodies (Secret Management) in expo-supabase appendix

**Files:**
- Modify: `cli/src/stacks/appendix.expo-supabase.ts`

This is content authoring; no test framework needed (the build-time registry consistency check in M2 will validate rule IDs). Step granularity reflects writing/reviewing the markdown.

- [ ] **Step 1: Add SECURITY_RULES constant — preamble + H.1.x**

Open `cli/src/stacks/appendix.expo-supabase.ts`. Below the existing `SCREEN_OWNERSHIP_MATRIX` constant, add:

```ts
const SECURITY_RULES = `Section H is the security contract surface for the expo-supabase stack. Rules are tagged with tiers: \`[demo]\` applies starting at demo (everywhere), \`[startup]\` applies at startup and regulated, \`[regulated]\` applies only at regulated, \`[always-block]\` is the catastrophic floor that blocks at every tier and cannot be allowlisted.

Tier ordering: \`demo < startup < regulated\`. The \`organism.security_tier\` field in mycelium.yaml selects the active tier. \`mycelium contracts audit\` enforces rules at-tier-or-below plus all \`[always-block]\` rules. Per-rule allowlists with \`reason + expires\` live in mycelium.yaml under \`organism.security_allowlist\`.

#### H.1 Secret Management

##### H.1.1 No hardcoded secrets in committed code [always-block]
Rule: No real API keys, tokens, or credentials in committed source. Exempt:
  literals containing the substring \`placeholder\` (case-sensitive) matching
  the §F.7 demo-stub fallback pattern.
Audit: \`grep -rEn 'sk_live_|sk_test_|eyJ[A-Za-z0-9]{30,}|service_role|AKIA[0-9A-Z]{16}' src/ supabase/\` excluding lines containing \`placeholder\` returns zero matches.
Violation: freeze-block at all tiers. Cannot be allowlisted.

##### H.1.2 .env gitignored, .env.example committed [demo]
Rule: \`.env\` is listed in \`.gitignore\`. \`.env.example\` (with no real values, only key names) IS committed. No \`.env*\` files are tracked by git except \`.env.example\`.
Audit: parse \`.gitignore\`; require \`.env\` listed. \`git ls-files\` returns no matches for \`.env\` or \`.env.local\` etc.; may return \`.env.example\`.
Violation: demo=advisory, startup+=freeze-block.

##### H.1.3 Service-role keys never reach client code [always-block]
Rule: The literal \`service_role\` MUST NOT appear in any file under \`src/\`. Allowed in \`supabase/functions/\` (server functions) and \`supabase/migrations/\` (server-side SQL) only.
Audit: \`grep -rn 'service_role' src/\` returns zero matches.
Violation: freeze-block at all tiers. Cannot be allowlisted.

##### H.1.4 Secrets sourced from a secret manager [startup]
Rule: At startup tier, runtime secrets are sourced from a secret manager (Doppler, 1Password CLI, AWS Secrets Manager, Vault, or equivalent), not raw env vars in CI. Documented in CLAUDE.md or README.
Audit: README or CLAUDE.md contains a "Secrets" or "Secret Management" section that names a secret manager; OR a \`.doppler.yaml\` / \`.1password\` / equivalent config file exists at the cultivation root.
Violation: startup+=freeze-block. Allowlistable with documented Q-X rollout date.

##### H.1.5 Secret rotation runbook documented [regulated]
Rule: At regulated tier, a \`docs/runbooks/secret-rotation.md\` (or equivalent) exists, lists every secret in the manifest, and specifies max age per secret (90 days default).
Audit: file exists; contains a table or list mapping secret name → max age.
Violation: regulated=freeze-block.

`;
```

- [ ] **Step 2: Verify it parses (build runs)**

```bash
cd cli && npm run build
```

Expected: tsc passes (the constant is valid TS, but `securityRules` field still empty in the export — that's the next step).

- [ ] **Step 3: Wire SECURITY_RULES into exported appendix**

At the bottom of the same file, find `export const EXPO_SUPABASE_APPENDIX:` and add `securityRules: SECURITY_RULES,` to the object literal:

```ts
export const EXPO_SUPABASE_APPENDIX: ContractAppendix = {
  preamble: PREAMBLE,
  dependencyManifest: DEPENDENCY_MANIFEST,
  primitiveProps: PRIMITIVE_PROPS,
  baselineOwnership: BASELINE_OWNERSHIP,
  barrelOwnership: BARREL_OWNERSHIP,
  allowlistedIdentifiers: ALLOWLISTED_IDENTIFIERS,
  styleSystemRules: STYLE_SYSTEM_RULES,
  screenOwnershipMatrix: SCREEN_OWNERSHIP_MATRIX,
  securityRules: SECURITY_RULES,
};
```

- [ ] **Step 4: Verify build still passes**

```bash
cd cli && npm run build
```

Expected: PASS. The new field is required by the interface (Task 2) and now provided.

- [ ] **Step 5: Commit**

```bash
git add cli/src/stacks/appendix.expo-supabase.ts
git commit -m "[MYC] §H.1 Secret Management rules in expo-supabase appendix"
```

---

### Task 5: Draft H.2.x rule bodies (Auth Flows) including secureStorageAdapter snippet

**Files:**
- Modify: `cli/src/stacks/appendix.expo-supabase.ts`

- [ ] **Step 1: Append H.2.x rules to SECURITY_RULES**

In `cli/src/stacks/appendix.expo-supabase.ts`, find the closing backtick of the `SECURITY_RULES` template literal. Insert before it:

```
#### H.2 Auth Flows

##### H.2.1 OAuth PKCE only — no implicit grant [demo]
Rule: All OAuth flows use the PKCE extension. No implicit-grant flows.
  expo-auth-session's \`useAuthRequest\` accepts a \`responseType: 'code'\`
  config — that is the required path. Implicit grant (\`responseType: 'token'\`)
  is forbidden.
Audit: grep \`responseType:\\s*['"]token['"]\` in src/; must return zero matches.
  Optionally, grep \`code_challenge\` to verify PKCE is wired (advisory).
Violation: demo=advisory, startup+=freeze-block.

##### H.2.2 Tokens in expo-secure-store via adapter; never raw AsyncStorage [demo, expo-supabase]
Rule: Supabase session tokens MUST be persisted via the secureStorageAdapter
  (which wraps expo-secure-store with the AsyncStorage interface, chunking
  values across keys to bypass the 2KB-per-value limit). Raw AsyncStorage
  is forbidden for any auth/session/token persistence.
Audit: in any \`createClient(...)\` call's \`auth.storage\` argument, the
  identifier MUST resolve to an expo-secure-store-backed adapter — NOT raw
  AsyncStorage. Regex approximation: grep \`storage:\\s*AsyncStorage\` in src/
  must return zero matches.

The canonical adapter is shipped by the app-shell biome at
\`src/lib/secureStorage.ts\`:

\`\`\`ts
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800; // bytes; under expo-secure-store's 2KB limit

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const meta = await SecureStore.getItemAsync(\`\${key}__meta\`);
    if (!meta) return null;
    const { chunks } = JSON.parse(meta);
    const parts = await Promise.all(
      Array.from({ length: chunks }, (_, i) =>
        SecureStore.getItemAsync(\`\${key}__\${i}\`)
      )
    );
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const chunks = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(\`\${key}__meta\`, JSON.stringify({ chunks }));
    await Promise.all(
      Array.from({ length: chunks }, (_, i) =>
        SecureStore.setItemAsync(
          \`\${key}__\${i}\`,
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        )
      )
    );
  },
  async removeItem(key: string): Promise<void> {
    const meta = await SecureStore.getItemAsync(\`\${key}__meta\`);
    if (!meta) return;
    const { chunks } = JSON.parse(meta);
    await Promise.all([
      SecureStore.deleteItemAsync(\`\${key}__meta\`),
      ...Array.from({ length: chunks }, (_, i) =>
        SecureStore.deleteItemAsync(\`\${key}__\${i}\`)
      ),
    ]);
  },
};
\`\`\`

Supabase client wiring (replaces §F.7's AsyncStorage example):

\`\`\`ts
import { createClient } from '@supabase/supabase-js';
import { secureStorageAdapter } from '@/lib/secureStorage';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
\`\`\`
Violation: demo=advisory, startup+=freeze-block.

##### H.2.3 Session refresh with rotating tokens [startup]
Rule: \`autoRefreshToken: true\` is set on createClient. The app handles
  refresh failures by signing out cleanly (no silent stale-token reuse).
Audit: grep \`autoRefreshToken: true\` in src/lib/supabase.ts (or equivalent);
  must match.
Violation: startup+=freeze-block.

##### H.2.4 Short-lived access tokens (<1hr) [regulated]
Rule: Supabase JWT expiry configured to ≤3600 seconds. Documented in the
  cultivation's Supabase project settings checklist.
Audit: README or CLAUDE.md contains a Supabase config section noting JWT
  expiry ≤3600s.
Violation: regulated=freeze-block.

```

- [ ] **Step 2: Verify build still passes**

```bash
cd cli && npm run build
```

Expected: PASS (template literal is well-formed).

- [ ] **Step 3: Verify dry-run rendering**

```bash
cd cli && node dist/index.js plant /Users/spy/mfautomation/repos/live-grid/brief.stripped.md --stack expo-supabase --dry-run 2>&1 | grep -E "H\.2\.1|H\.2\.2|secureStorageAdapter" | head -5
```

Expected: shows the H.2.x rule names + the adapter snippet appearing in the rendered prompt.

- [ ] **Step 4: Commit**

```bash
git add cli/src/stacks/appendix.expo-supabase.ts
git commit -m "[MYC] §H.2 Auth Flows + secureStorageAdapter pattern"
```

---

### Task 6: Draft H.3.x rule bodies (Database/RLS)

**Files:**
- Modify: `cli/src/stacks/appendix.expo-supabase.ts`

- [ ] **Step 1: Append H.3.x rules to SECURITY_RULES**

In `cli/src/stacks/appendix.expo-supabase.ts`, append to the `SECURITY_RULES` template literal (before the closing backtick):

```
#### H.3 Database (RLS)

##### H.3.1 Every Supabase table has RLS enabled [always-block]
Rule: Every \`CREATE TABLE\` in supabase/migrations/*.sql is followed within
  the same migration file by an \`ALTER TABLE <name> ENABLE ROW LEVEL SECURITY\`.
Audit: parse migration SQL; for each \`CREATE TABLE <name>\`, verify a
  corresponding \`ALTER TABLE <name> ENABLE ROW LEVEL SECURITY\` exists in
  the same file. v1: regex-based. v2: ts-pg-parse for stricter coverage.
Violation: freeze-block at all tiers. Cannot be allowlisted.

##### H.3.2 No table grants SELECT * to anon role [demo]
Rule: No RLS policy grants unrestricted SELECT to the \`anon\` role. Policies
  TO anon must specify column-level grants OR have a USING clause that
  restricts rows.
Audit: parse migration SQL; flag any \`CREATE POLICY ... TO anon\` that
  lacks a column list AND lacks a USING clause; OR any \`GRANT SELECT ON ...
  TO anon\` without column restrictions.
Violation: demo=advisory, startup+=freeze-block.

##### H.3.3 Explicit policies per role on every table [startup]
Rule: Every table has at least one \`CREATE POLICY\` for each role in the
  organism's role set (e.g., authenticated, plus any custom roles defined
  in §C). Tables without policies (RLS enabled but no policies) are locked
  except for service_role — which violates H.1.3 if accessed from client.
Audit: parse migration SQL; for each table, count policies per role; flag
  tables with zero policies for non-service roles.
Violation: startup+=freeze-block.

##### H.3.4 service_role only in server functions [demo]
Rule: \`service_role\` key (literal or env var \`SUPABASE_SERVICE_ROLE_KEY\`)
  used only in \`supabase/functions/*\` or server-side code. Never in \`src/\`.
  This is paired with H.1.3 (which is the always-block version).
Audit: grep \`SUPABASE_SERVICE_ROLE_KEY\` in src/; must return zero.
Violation: demo=advisory (paired with H.1.3 always-block), startup+=freeze-block.

##### H.3.5 Row-level audit trail on PII tables [regulated]
Rule: Tables containing PII columns (per H.4.4 annotations) MUST have a
  trigger that logs every INSERT/UPDATE/DELETE to an audit_log table with
  user_id, timestamp, and operation type.
Audit: parse migration SQL; for each table with a PII annotation comment,
  verify a CREATE TRIGGER exists for INSERT/UPDATE/DELETE pointing at
  audit_log.
Violation: regulated=freeze-block.

```

- [ ] **Step 2: Verify build**

```bash
cd cli && npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add cli/src/stacks/appendix.expo-supabase.ts
git commit -m "[MYC] §H.3 Database (RLS) rules"
```

---

### Task 7: Draft H.4.x rule bodies (PII Handling)

**Files:**
- Modify: `cli/src/stacks/appendix.expo-supabase.ts`

- [ ] **Step 1: Append H.4.x rules to SECURITY_RULES**

In `cli/src/stacks/appendix.expo-supabase.ts`, append to the `SECURITY_RULES` template literal (before the closing backtick):

```
#### H.4 PII Handling

##### H.4.1 PII categories defined [demo]
Rule: NUTRIENTS.md §H.4 (this section) explicitly defines what counts as
  PII for this organism. Default vocabulary (override in NUTRIENTS to add
  domain-specific items): email, phone, postal/street address, payment
  info (card number, bank account), real legal name, geolocation
  coordinates (lat/lng), national identifiers (SSN, government ID),
  date of birth, health/medical data.
Audit: this rule is contract-vs-contract — verifies the PII vocabulary is
  present in NUTRIENTS, not in source. The audit prompt checks for it.
Violation: demo=advisory, startup+=freeze-block.

##### H.4.2 No PII in console.log or analytics events [demo]
Rule: Source code MUST NOT pass PII-tagged identifiers (per H.4.1
  vocabulary) into \`console.log\`, \`console.warn\`, \`console.error\`,
  \`console.info\`, \`analytics.track()\`, \`Sentry.captureException()\`, or
  any equivalent telemetry sink. Use sanitized references instead
  (user_id, not email; "card ending in X", not full PAN).
Audit: regex grep on src/: \`console\\.(log|warn|error|info)\\([^)]*\\b(email|phone|address|ssn|password|token|api[_-]?key)\\b\` — flag matches. v1: identifier-name match (approximate). v2: TS AST tracking variable types tagged @pii.
Violation: demo=advisory, startup+=freeze-block.

##### H.4.3 Error messages sanitize PII; user IDs only [startup]
Rule: User-facing error messages display user_id, never email or phone.
  Backend error responses returned to clients are sanitized (no stack
  traces, no DB error text containing PII fields).
Audit: regex grep for error-handling patterns that include PII identifiers
  in toast/alert/error-throw arguments. v1: heuristic. v2: TS AST.
Violation: startup+=freeze-block.

##### H.4.4 PII columns annotated for audit detection [startup]
Rule: Every column in supabase/migrations/*.sql holding a PII value carries
  a SQL comment with the literal token \`@pii\`, optionally followed by the
  category. Example:
  \`\`\`sql
  CREATE TABLE profiles (
    id uuid PRIMARY KEY,
    email text NOT NULL,  -- @pii email
    phone text,           -- @pii phone
    legal_name text       -- @pii name
  );
  \`\`\`
  This makes PII columns programmatically detectable for H.3.5 (audit
  trail), H.4.5 (access logging), and downstream tooling.
Audit: parse migration SQL; for known-PII column name patterns (email,
  phone, address, ssn, name, dob, etc.), verify an adjacent \`-- @pii\`
  comment exists. v1: regex. v2: SQL parser.
Violation: startup+=freeze-block.

##### H.4.5 PII access logged with role + reason [regulated]
Rule: Backend code reading PII columns from PII-annotated tables (per
  H.4.4) emits an access-log entry with: requesting user_id, role, target
  user_id, columns accessed, reason code. Documented logging
  infrastructure required.
Audit: README or CLAUDE.md contains a "PII Access Logging" section
  describing the audit-log schema and write path.
Violation: regulated=freeze-block.
`;
```

- [ ] **Step 2: Verify build**

```bash
cd cli && npm run build
```

Expected: PASS.

- [ ] **Step 3: Verify dry-run shows H.4 rendered**

```bash
cd cli && node dist/index.js plant /Users/spy/mfautomation/repos/live-grid/brief.stripped.md --stack expo-supabase --dry-run 2>&1 | grep -E "H\\.4\\.[1-5]" | head
```

Expected: shows H.4.1 through H.4.5 in the rendered prompt.

- [ ] **Step 3: Commit**

```bash
git add cli/src/stacks/appendix.expo-supabase.ts
git commit -m "[MYC] §H.4 PII Handling rules"
```

---

### Task 8: Add `securityRules` to nextjs-fastapi-supabase appendix

**Files:**
- Modify: `cli/src/stacks/appendix.nextjs-fastapi-supabase.ts`

This is a conservative initial baseline; will tighten on the first cultivation hitting this stack.

- [ ] **Step 1: Add SECURITY_RULES constant**

In `cli/src/stacks/appendix.nextjs-fastapi-supabase.ts`, above the `export const NEXTJS_FASTAPI_SUPABASE_APPENDIX:` declaration, add:

```ts
const SECURITY_RULES = `Section H is the security contract surface for the nextjs-fastapi-supabase stack. Initial baseline — will tighten on first cultivation. Rules tagged with tiers: \`[demo]\` everywhere, \`[startup]\` startup+regulated, \`[regulated]\` regulated only, \`[always-block]\` blocks at every tier.

#### H.1 Secret Management

##### H.1.1 No hardcoded secrets in committed code [always-block]
Rule: No real API keys, tokens, or credentials in committed source. Exempt:
  literals containing \`placeholder\` matching demo-stub patterns.
Audit: \`grep -rEn 'sk_live_|sk_test_|eyJ[A-Za-z0-9]{30,}|service_role|AKIA[0-9A-Z]{16}' src/ api/\` excluding lines containing \`placeholder\` returns zero.
Violation: freeze-block at all tiers.

##### H.1.2 .env gitignored [demo]
Rule: \`.env\`, \`.env.local\`, \`.env.production\` listed in \`.gitignore\`. Only \`.env.example\` (no real values) committed.
Audit: parse \`.gitignore\`; \`git ls-files\` for .env* returns at most \`.env.example\`.
Violation: demo=advisory, startup+=freeze-block.

##### H.1.3 Server secrets never in client bundle [always-block]
Rule: Next.js client code (under \`app/\` or \`components/\` consumed by client components) MUST NOT reference secrets without \`NEXT_PUBLIC_\` prefix. Server-only secrets (no prefix) used only in Server Components, Server Actions, Route Handlers, or under \`api/\` (FastAPI).
Audit: in \`'use client'\`-annotated files, grep for env var references not starting with \`NEXT_PUBLIC_\`; must return zero.
Violation: freeze-block at all tiers.

#### H.2 Auth Flows

##### H.2.1 Sessions in httpOnly cookies, never localStorage [demo]
Rule: Auth tokens persisted as httpOnly + Secure + SameSite=Strict cookies. \`localStorage\`, \`sessionStorage\` for sessions are forbidden.
Audit: grep \`localStorage.setItem\` and \`sessionStorage.setItem\` in src/ near auth/session/token identifiers.
Violation: demo=advisory, startup+=freeze-block.

#### H.3 Database (RLS)

##### H.3.1 Every Supabase table has RLS enabled [always-block]
Rule: Every \`CREATE TABLE\` in migrations is followed by \`ENABLE ROW LEVEL SECURITY\` in the same file.
Audit: regex parse SQL migrations.
Violation: freeze-block at all tiers.

#### H.4 PII Handling

##### H.4.1 PII categories defined [demo]
Rule: NUTRIENTS.md §H.4 defines PII vocabulary (default: email, phone, address, payment, legal name, location, national IDs).
Audit: contract-vs-contract via audit prompt.
Violation: demo=advisory, startup+=freeze-block.

##### H.4.2 No PII in logs [demo]
Rule: \`console.log\`, \`console.error\`, server logger calls, and \`Sentry.captureException\` MUST NOT include PII identifiers.
Audit: regex grep for log calls containing PII identifier names.
Violation: demo=advisory, startup+=freeze-block.

(Other rules — H.2.2/H.2.3, H.3.2-5, H.4.3-5 — refine on first cultivation.)
`;
```

- [ ] **Step 2: Wire into exported appendix**

Update the exported object literal at the bottom of the file:

```ts
export const NEXTJS_FASTAPI_SUPABASE_APPENDIX: ContractAppendix = {
  preamble: PREAMBLE,
  dependencyManifest: DEPENDENCY_MANIFEST,
  primitiveProps: PRIMITIVE_PROPS,
  baselineOwnership: BASELINE_OWNERSHIP,
  barrelOwnership: BARREL_OWNERSHIP,
  allowlistedIdentifiers: ALLOWLISTED_IDENTIFIERS,
  styleSystemRules: STYLE_SYSTEM_RULES,
  screenOwnershipMatrix: SCREEN_OWNERSHIP_MATRIX,
  securityRules: SECURITY_RULES,
};
```

- [ ] **Step 3: Verify build**

```bash
cd cli && npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add cli/src/stacks/appendix.nextjs-fastapi-supabase.ts
git commit -m "[MYC] §H baseline for nextjs-fastapi-supabase appendix"
```

---

### Task 9: Add `--security` flag to `mycelium plant`

**Files:**
- Modify: `cli/src/commands/plant.ts`

- [ ] **Step 1: Add the option**

In `cli/src/commands/plant.ts`, find the `program.command("plant <brief>")` block. Below the existing `-s, --stack` option, add:

```ts
    .option(
      "-S, --security <tier>",
      "Security tier (demo, startup, regulated). REQUIRED on first plant of an organism; reads from mycelium.yaml on subsequent plants."
    )
```

- [ ] **Step 2: Add tier validation type**

At the top of `cli/src/commands/plant.ts`, after existing imports, add:

```ts
// Local definition for M1. Migrated to cli/src/security/types.ts in Task 11
// (M2). After Task 11 lands, plant.ts imports from there and these constants
// are deleted from this file. Until then, keep them local — types.ts doesn't
// exist yet.
const SECURITY_TIERS = ["demo", "startup", "regulated"] as const;
type SecurityTier = typeof SECURITY_TIERS[number];

function isSecurityTier(s: unknown): s is SecurityTier {
  return typeof s === "string" && (SECURITY_TIERS as readonly string[]).includes(s);
}
```

- [ ] **Step 3: Hard-fail-on-first-plant logic**

In the same file, find the existing stack-resolution block (after `if (!opts.stack) { ... }`). Right after the stack lookup succeeds, add:

```ts
      // Resolve security tier: read from existing yaml if present, else require --security flag.
      const yamlPath = path.join(targetDir, "mycelium.yaml");
      const existingTier: string | undefined = (() => {
        if (!fs.existsSync(yamlPath)) return undefined;
        try {
          const yaml = require("yaml");
          const cfg = yaml.parse(fs.readFileSync(yamlPath, "utf-8"));
          return cfg?.organism?.security_tier;
        } catch {
          return undefined;
        }
      })();

      let securityTier: SecurityTier;
      if (opts.security) {
        if (!isSecurityTier(opts.security)) {
          console.log(
            chalk.red(`  ❌ Invalid --security tier "${opts.security}". Available: `) +
              chalk.cyan(SECURITY_TIERS.join(", "))
          );
          process.exit(1);
        }
        if (existingTier && existingTier !== opts.security) {
          console.log(
            chalk.red(
              `  ❌ Tier flip via plant is not supported (current: ${existingTier}, requested: ${opts.security}).`
            )
          );
          console.log(
            chalk.gray(
              `     Use \`mycelium contracts upgrade-tier ${opts.security}\` instead — it's faster and doesn't re-invoke the planner LLM.`
            )
          );
          process.exit(1);
        }
        securityTier = opts.security;
      } else if (existingTier && isSecurityTier(existingTier)) {
        securityTier = existingTier;
      } else {
        console.log(
          chalk.red("  ❌ --security is required on first plant. Available: ") +
            chalk.cyan(SECURITY_TIERS.join(", "))
        );
        console.log(
          chalk.gray(
            "     Tier sets the security contract enforcement strictness. Forgetting it"
          )
        );
        console.log(
          chalk.gray(
            "     would default the cultivation to weakest protection — explicit choice required."
          )
        );
        process.exit(1);
      }
```

Note: requires `import` of `yaml` to be added — but plant.ts doesn't currently import yaml. Add at top of file:

```ts
import YAML from "yaml";
```

Replace the inline `const yaml = require("yaml")` with:

```ts
          const cfg = YAML.parse(fs.readFileSync(yamlPath, "utf-8"));
```

- [ ] **Step 4: Pass tier through to planner prompt**

Find the `buildPlannerPrompt(...)` call and update its arguments:

```ts
      const prompt = buildPlannerPrompt({
        brief,
        organismName,
        targetDir,
        stack,
        securityTier,
      });
```

Then update `buildPlannerPrompt`'s signature and body. Find:

```ts
function buildPlannerPrompt(args: {
  brief: string;
  organismName: string;
  targetDir: string;
  stack: NonNullable<ReturnType<typeof getStack>>;
}): string {
  const { brief, organismName, stack } = args;
```

Replace with:

```ts
function buildPlannerPrompt(args: {
  brief: string;
  organismName: string;
  targetDir: string;
  stack: NonNullable<ReturnType<typeof getStack>>;
  securityTier: SecurityTier;
}): string {
  const { brief, organismName, stack, securityTier } = args;
```

- [ ] **Step 5: Update planner instructions to record tier in mycelium.yaml**

In `buildPlannerPrompt`, find the `mycelium.yaml` section of the prompt. Update the yaml schema example. Find:

```
   organism:
     name: ${organismName}
     stack: ${stack.name}
```

Replace with:

```
   organism:
     name: ${organismName}
     stack: ${stack.name}
     security_tier: ${securityTier}        # REQUIRED — audit/freeze/upgrade-tier read this
```

Below the yaml example, add a directive:

```
   The \`security_tier:\` field MUST be \`${securityTier}\`. Downstream commands
   (audit, freeze, upgrade-tier) look it up. Section H of NUTRIENTS will be
   rendered with rules tagged at-tier-or-below + always-block rules active.
```

- [ ] **Step 6: Build + verify**

```bash
cd cli && npm run build
```

Expected: PASS.

- [ ] **Step 7: Verify hard-fail without --security**

```bash
cd cli && node dist/index.js plant /Users/spy/mfautomation/repos/live-grid/brief.stripped.md --stack expo-supabase --dry-run
```

Expected: prints "❌ --security is required on first plant" and exits non-zero.

- [ ] **Step 8: Verify dry-run with --security demo renders §H**

```bash
cd cli && node dist/index.js plant /Users/spy/mfautomation/repos/live-grid/brief.stripped.md --stack expo-supabase --security demo --dry-run 2>&1 | grep -E "security_tier: demo|H\\.1\\.1|H\\.4\\.1" | head
```

Expected: shows the security_tier yaml field plus several rule headers in the rendered prompt.

- [ ] **Step 9: Commit**

```bash
git add cli/src/commands/plant.ts
git commit -m "[MYC] add --security flag to plant; record tier in mycelium.yaml"
```

---

### Task 10: M1 acceptance — full plan dry-run against an existing brief

**Files:** none modified (verification step).

- [ ] **Step 1: Verify full prompt rendering**

```bash
cd cli && node dist/index.js plant /Users/spy/mfautomation/repos/live-grid/brief.stripped.md --stack expo-supabase --security startup --dry-run > /tmp/m1-dryrun.txt 2>&1 && wc -l /tmp/m1-dryrun.txt && grep -c "###" /tmp/m1-dryrun.txt && grep -E "^###" /tmp/m1-dryrun.txt | head -20
```

Expected: line count >2000; 8+ `###` section headers; including `### H. Security Rules`.

- [ ] **Step 2: Verify all H.x.x rule IDs present**

```bash
grep -oE "H\.[1-4]\.[1-5]" /tmp/m1-dryrun.txt | sort -u
```

Expected: H.1.1, H.1.2, H.1.3, H.1.4, H.1.5, H.2.1, H.2.2, H.2.3, H.2.4, H.3.1, H.3.2, H.3.3, H.3.4, H.3.5, H.4.1, H.4.2, H.4.3, H.4.4, H.4.5 (19–20 distinct rule IDs).

- [ ] **Step 3: Verify always-block tags present**

```bash
grep -c "\\[always-block\\]" /tmp/m1-dryrun.txt
```

Expected: ≥3 (H.1.1, H.1.3, H.3.1).

- [ ] **Step 4: M1 milestone tag commit**

```bash
git tag m1-section-h-content
git log --oneline | head -10
```

M1 complete: §H content lives in NUTRIENTS at plant time; no enforcement yet.

---

# M2 — Scanners + audit integration (14 tasks)

Goal: framework grows source-scanning teeth. Audit gate enforces §H at the operator's chosen tier with allowlist + tier modulation.

### Task 11: Create security types module

**Files:**
- Create: `cli/src/security/types.ts`
- Create: `cli/src/security/types.test.ts`

- [ ] **Step 1: Write failing test**

Create `cli/src/security/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  type Finding,
  type SecurityTier,
  type Severity,
  type SecurityAllowlistEntry,
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
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd cli && npm test -- src/security/types.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement types**

Create `cli/src/security/types.ts`:

```ts
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
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Migrate plant.ts to import from types.ts**

In `cli/src/commands/plant.ts`, the local definitions of `SECURITY_TIERS`, `SecurityTier`, and `isSecurityTier` (added in Task 9 Step 2) are now duplicated. Remove the local block and replace with an import:

```ts
import {
  SECURITY_TIERS,
  isSecurityTier,
  type SecurityTier,
} from "../security/types.js";
```

Delete the local declarations:

```ts
// REMOVE THESE — now in cli/src/security/types.ts
const SECURITY_TIERS = ["demo", "startup", "regulated"] as const;
type SecurityTier = typeof SECURITY_TIERS[number];

function isSecurityTier(s: unknown): s is SecurityTier {
  return typeof s === "string" && (SECURITY_TIERS as readonly string[]).includes(s);
}
```

- [ ] **Step 6: Verify build still passes**

```bash
cd cli && npm run build
```

Expected: PASS — no duplicate-declaration errors, plant.ts uses the shared types.

- [ ] **Step 7: Commit**

```bash
git add cli/src/security/types.ts cli/src/security/types.test.ts cli/src/commands/plant.ts
git commit -m "[MYC] add security types module + migrate plant.ts to shared types"
```

---

### Task 12: Create scanner registry with build-time consistency check

**Files:**
- Create: `cli/src/security/registry.ts`
- Create: `cli/src/security/registry.test.ts`

- [ ] **Step 1: Write failing test**

Create `cli/src/security/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SCANNER_REGISTRY, getScanner, listRegisteredRuleIds, assertRegistryConsistency } from './registry.js';
import { STACKS } from '../stacks/index.js';

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

  it('assertRegistryConsistency does not throw when registry matches appendices', () => {
    expect(() => assertRegistryConsistency(STACKS)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd cli && npm test -- src/security/registry.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement registry**

Create `cli/src/security/registry.ts`:

```ts
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
  const DOCUMENTATION_ONLY = new Set<string>([
    'H.1.5',  // secret rotation runbook (regulated, doc-only)
    'H.2.4',  // short-lived tokens (regulated, doc-only)
    'H.3.5',  // PII audit trail (regulated, doc-only — covered by H.4.4 + DB triggers)
    'H.4.1',  // PII vocabulary defined (contract-vs-contract via audit prompt)
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
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/registry.test.ts
```

Expected: PASS — registry empty, no appendix scans yet so consistency check passes vacuously.

- [ ] **Step 5: Commit**

```bash
git add cli/src/security/registry.ts cli/src/security/registry.test.ts
git commit -m "[MYC] scanner registry + build-time consistency check"
```

---

### Task 13: Implement scanner H.1.1 (hardcoded secrets)

**Files:**
- Create: `cli/src/security/scanners.ts`
- Create: `cli/src/security/scanners.test.ts`
- Create: `cli/src/security/fixtures/H.1.1/good/sample.ts`
- Create: `cli/src/security/fixtures/H.1.1/bad/leaked_key.ts`

- [ ] **Step 1: Create test fixtures**

Create `cli/src/security/fixtures/H.1.1/good/sample.ts`:

```ts
// GOOD: placeholder fallback per §F.7
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';
```

Create `cli/src/security/fixtures/H.1.1/bad/leaked_key.ts`:

```ts
// BAD: hardcoded real Stripe key
const stripeKey = 'sk_live_abcdefghij1234567890ABCDEFGHIJ12';
const supabaseToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSIsInR5cCI6IkpXVCJ9.dummy_signature_xxxxxxxxxxxxxxxx';
```

- [ ] **Step 2: Write failing test**

Create `cli/src/security/scanners.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { scanH_1_1_HardcodedSecrets } from './scanners.js';

const FIXTURES = path.resolve(__dirname, 'fixtures');

describe('scanH_1_1_HardcodedSecrets', () => {
  it('flags real keys in bad fixtures', async () => {
    const findings = await scanH_1_1_HardcodedSecrets(path.join(FIXTURES, 'H.1.1', 'bad'));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe('H.1.1');
    expect(findings[0].ruleTier).toBe('always-block');
  });

  it('does not flag placeholder fallbacks in good fixtures', async () => {
    const findings = await scanH_1_1_HardcodedSecrets(path.join(FIXTURES, 'H.1.1', 'good'));
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement scanner**

Create `cli/src/security/scanners.ts`:

```ts
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

/** Run grep, return matching lines as "path:line" strings. Empty array on no match. */
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
  // Search src/ and supabase/ if they exist.
  const targets = ['src', 'supabase'].filter((d) =>
    fs.existsSync(path.join(cwd, d))
  );
  if (targets.length === 0) return [];

  const lines = grepLines(
    ['-rEn', HARDCODED_SECRET_PATTERN, ...targets],
    cwd
  );

  // Filter out exempt placeholder lines.
  const real = lines.filter((l) => !l.includes('placeholder'));

  return real.map((line): Finding => {
    // Format: "src/foo.ts:42:matched_text"
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
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: PASS — bad fixture flagged, good fixture clean.

- [ ] **Step 6: Commit**

```bash
git add cli/src/security/scanners.ts cli/src/security/scanners.test.ts cli/src/security/fixtures/H.1.1/
git commit -m "[MYC] scanner H.1.1 — hardcoded secrets"
```

---

### Task 14: Implement scanner H.1.2 (.env gitignored)

**Files:**
- Modify: `cli/src/security/scanners.ts`
- Modify: `cli/src/security/scanners.test.ts`
- Create: `cli/src/security/fixtures/H.1.2/good/.gitignore`
- Create: `cli/src/security/fixtures/H.1.2/bad/.gitignore`

- [ ] **Step 1: Create fixtures**

Create `cli/src/security/fixtures/H.1.2/good/.gitignore`:

```
.env
.env.local
node_modules/
```

Create `cli/src/security/fixtures/H.1.2/bad/.gitignore`:

```
node_modules/
# .env NOT listed
```

- [ ] **Step 2: Append failing test to scanners.test.ts**

```ts
import { scanH_1_2_DotenvIgnored } from './scanners.js';

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
```

- [ ] **Step 3: Run test, verify it fails**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: FAIL — `scanH_1_2_DotenvIgnored` is not exported.

- [ ] **Step 4: Implement scanner**

Append to `cli/src/security/scanners.ts`:

```ts
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
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/security/scanners.ts cli/src/security/scanners.test.ts cli/src/security/fixtures/H.1.2/
git commit -m "[MYC] scanner H.1.2 — .env gitignored"
```

---

### Task 15: Implement scanner H.1.3 (service_role not in client)

**Files:**
- Modify: `cli/src/security/scanners.ts`
- Modify: `cli/src/security/scanners.test.ts`
- Create: `cli/src/security/fixtures/H.1.3/good/src/lib/supabase.ts`
- Create: `cli/src/security/fixtures/H.1.3/bad/src/lib/admin.ts`

- [ ] **Step 1: Create fixtures**

Create `cli/src/security/fixtures/H.1.3/good/src/lib/supabase.ts`:

```ts
// GOOD: anon key only
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(url, anonKey);
```

Create `cli/src/security/fixtures/H.1.3/bad/src/lib/admin.ts`:

```ts
// BAD: service_role in client code
import { createClient } from '@supabase/supabase-js';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const adminClient = createClient(url, SUPABASE_SERVICE_ROLE_KEY!);
```

- [ ] **Step 2: Append failing test**

```ts
import { scanH_1_3_ServiceRoleNotInClient } from './scanners.js';

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
```

- [ ] **Step 3: Run test, verify it fails**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: FAIL — symbol not exported.

- [ ] **Step 4: Implement scanner**

Append to `cli/src/security/scanners.ts`:

```ts
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
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/security/scanners.ts cli/src/security/scanners.test.ts cli/src/security/fixtures/H.1.3/
git commit -m "[MYC] scanner H.1.3 — service_role not in client code"
```

---

### Task 16: Implement scanner H.2.1 (OAuth PKCE)

**Files:**
- Modify: `cli/src/security/scanners.ts`
- Modify: `cli/src/security/scanners.test.ts`
- Create: `cli/src/security/fixtures/H.2.1/good/src/lib/auth.ts`
- Create: `cli/src/security/fixtures/H.2.1/bad/src/lib/auth.ts`

- [ ] **Step 1: Create fixtures**

`cli/src/security/fixtures/H.2.1/good/src/lib/auth.ts`:

```ts
// GOOD: PKCE flow
import { useAuthRequest } from 'expo-auth-session';
const config = { responseType: 'code', usePKCE: true };
```

`cli/src/security/fixtures/H.2.1/bad/src/lib/auth.ts`:

```ts
// BAD: implicit grant
import { useAuthRequest } from 'expo-auth-session';
const config = { responseType: 'token' };
```

- [ ] **Step 2: Append failing test**

```ts
import { scanH_2_1_OAuthPKCE } from './scanners.js';

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
```

- [ ] **Step 3: Run test, verify it fails**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement scanner**

Append to `cli/src/security/scanners.ts`:

```ts
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
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/security/scanners.ts cli/src/security/scanners.test.ts cli/src/security/fixtures/H.2.1/
git commit -m "[MYC] scanner H.2.1 — OAuth PKCE only"
```

---

### Task 17: Implement scanner H.2.2 (tokens via secureStorageAdapter, not raw AsyncStorage)

**Files:**
- Modify: `cli/src/security/scanners.ts`
- Modify: `cli/src/security/scanners.test.ts`
- Create: `cli/src/security/fixtures/H.2.2/good/src/lib/supabase.ts`
- Create: `cli/src/security/fixtures/H.2.2/bad/src/lib/supabase.ts`

- [ ] **Step 1: Create fixtures**

`cli/src/security/fixtures/H.2.2/good/src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { secureStorageAdapter } from '@/lib/secureStorage';

export const supabase = createClient(url, key, {
  auth: { storage: secureStorageAdapter },
});
```

`cli/src/security/fixtures/H.2.2/bad/src/lib/supabase.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(url, key, {
  auth: { storage: AsyncStorage },
});
```

- [ ] **Step 2: Append failing test**

```ts
import { scanH_2_2_SecureTokenStorage } from './scanners.js';

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
```

- [ ] **Step 3: Run test, verify it fails**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement scanner**

Append to `cli/src/security/scanners.ts`:

```ts
// ───────── H.2.2 — secureStorageAdapter for Supabase auth, not raw AsyncStorage ─────────

export function scanH_2_2_SecureTokenStorage(cwd: string): Finding[] {
  const srcDir = path.join(cwd, 'src');
  if (!fs.existsSync(srcDir)) return [];

  // Match `storage: AsyncStorage` (with or without whitespace).
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
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/security/scanners.ts cli/src/security/scanners.test.ts cli/src/security/fixtures/H.2.2/
git commit -m "[MYC] scanner H.2.2 — secureStorageAdapter for Supabase auth"
```

---

### Task 18: Implement scanner H.2.3 (autoRefreshToken)

**Files:**
- Modify: `cli/src/security/scanners.ts`
- Modify: `cli/src/security/scanners.test.ts`
- Create: `cli/src/security/fixtures/H.2.3/good/src/lib/supabase.ts`
- Create: `cli/src/security/fixtures/H.2.3/bad/src/lib/supabase.ts`

- [ ] **Step 1: Create fixtures**

`cli/src/security/fixtures/H.2.3/good/src/lib/supabase.ts`:

```ts
export const supabase = createClient(url, key, {
  auth: { storage: secureStorageAdapter, autoRefreshToken: true },
});
```

`cli/src/security/fixtures/H.2.3/bad/src/lib/supabase.ts`:

```ts
export const supabase = createClient(url, key, {
  auth: { storage: secureStorageAdapter },
});
```

- [ ] **Step 2: Append failing test**

```ts
import { scanH_2_3_AutoRefreshToken } from './scanners.js';

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
```

- [ ] **Step 3: Run, verify failing**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement scanner**

Append to `cli/src/security/scanners.ts`:

```ts
// ───────── H.2.3 — autoRefreshToken: true ─────────

export function scanH_2_3_AutoRefreshToken(cwd: string): Finding[] {
  const srcDir = path.join(cwd, 'src');
  if (!fs.existsSync(srcDir)) return [];

  // Find any createClient(...) calls. For each, verify autoRefreshToken: true
  // is present in the surrounding 10 lines.
  const createClientLines = grepLines(['-rEn', 'createClient\\(', 'src'], cwd);
  if (createClientLines.length === 0) return [];

  const findings: Finding[] = [];
  for (const line of createClientLines) {
    const [filePart, lineNumStr] = line.split(':');
    const lineNum = parseInt(lineNumStr, 10);
    const fullPath = path.join(cwd, filePart);
    if (!fs.existsSync(fullPath)) continue;
    const allLines = fs.readFileSync(fullPath, 'utf-8').split('\n');
    // Look at the createClient line and the next 10 lines.
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
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/security/scanners.ts cli/src/security/scanners.test.ts cli/src/security/fixtures/H.2.3/
git commit -m "[MYC] scanner H.2.3 — autoRefreshToken on Supabase client"
```

---

### Task 19: Implement scanner H.3.1 (RLS enabled per table)

**Files:**
- Modify: `cli/src/security/scanners.ts`
- Modify: `cli/src/security/scanners.test.ts`
- Create: `cli/src/security/fixtures/H.3.1/good/supabase/migrations/001_init.sql`
- Create: `cli/src/security/fixtures/H.3.1/bad/supabase/migrations/001_init.sql`

- [ ] **Step 1: Create fixtures**

`cli/src/security/fixtures/H.3.1/good/supabase/migrations/001_init.sql`:

```sql
CREATE TABLE profiles (id uuid PRIMARY KEY, name text);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE bookings (id uuid PRIMARY KEY, talent_id uuid);
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
```

`cli/src/security/fixtures/H.3.1/bad/supabase/migrations/001_init.sql`:

```sql
CREATE TABLE profiles (id uuid PRIMARY KEY, name text);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Forgot RLS on bookings
CREATE TABLE bookings (id uuid PRIMARY KEY, talent_id uuid);
```

- [ ] **Step 2: Append failing test**

```ts
import { scanH_3_1_RLSEnabled } from './scanners.js';

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
```

- [ ] **Step 3: Run, verify failing**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement scanner**

Append to `cli/src/security/scanners.ts`:

```ts
// ───────── H.3.1 — every table has RLS enabled ─────────

export function scanH_3_1_RLSEnabled(cwd: string): Finding[] {
  const migrationsDir = path.join(cwd, 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) return [];

  const findings: Finding[] = [];
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');

    // Find every CREATE TABLE <name>
    const createRe = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/gi;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(content)) !== null) {
      const tableName = m[1];
      // Look for ENABLE ROW LEVEL SECURITY for this table anywhere in the same file.
      const rlsRe = new RegExp(
        `ALTER\\s+TABLE\\s+["']?${tableName}["']?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i'
      );
      if (!rlsRe.test(content)) {
        // Compute approximate line of the CREATE TABLE.
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
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/security/scanners.ts cli/src/security/scanners.test.ts cli/src/security/fixtures/H.3.1/
git commit -m "[MYC] scanner H.3.1 — RLS enabled per table"
```

---

### Task 20: Implement scanner H.3.2 (no anon SELECT * grants)

**Files:**
- Modify: `cli/src/security/scanners.ts`
- Modify: `cli/src/security/scanners.test.ts`
- Create: `cli/src/security/fixtures/H.3.2/good/supabase/migrations/001_policies.sql`
- Create: `cli/src/security/fixtures/H.3.2/bad/supabase/migrations/001_policies.sql`

- [ ] **Step 1: Create fixtures**

`cli/src/security/fixtures/H.3.2/good/supabase/migrations/001_policies.sql`:

```sql
CREATE POLICY "anon read public profiles" ON profiles
  FOR SELECT TO anon
  USING (is_public = true);

GRANT SELECT (id, display_name) ON profiles TO anon;
```

`cli/src/security/fixtures/H.3.2/bad/supabase/migrations/001_policies.sql`:

```sql
GRANT SELECT ON profiles TO anon;
```

- [ ] **Step 2: Append failing test**

```ts
import { scanH_3_2_NoAnonSelectStar } from './scanners.js';

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
```

- [ ] **Step 3: Run, verify failing**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement scanner**

Append to `cli/src/security/scanners.ts`:

```ts
// ───────── H.3.2 — no unrestricted SELECT to anon ─────────

export function scanH_3_2_NoAnonSelectStar(cwd: string): Finding[] {
  const migrationsDir = path.join(cwd, 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) return [];

  const findings: Finding[] = [];
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    // Match `GRANT SELECT ON <table> TO anon` — without column list (no `(`).
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
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/security/scanners.ts cli/src/security/scanners.test.ts cli/src/security/fixtures/H.3.2/
git commit -m "[MYC] scanner H.3.2 — no unrestricted SELECT to anon"
```

---

### Task 21: Implement scanner H.4.2 (no PII in logs)

**Files:**
- Modify: `cli/src/security/scanners.ts`
- Modify: `cli/src/security/scanners.test.ts`
- Create: `cli/src/security/fixtures/H.4.2/good/src/lib/log.ts`
- Create: `cli/src/security/fixtures/H.4.2/bad/src/lib/log.ts`

- [ ] **Step 1: Create fixtures**

`cli/src/security/fixtures/H.4.2/good/src/lib/log.ts`:

```ts
console.log('user signed in', { user_id: u.id });
analytics.track('signup_complete', { user_id: u.id, plan: u.plan });
```

`cli/src/security/fixtures/H.4.2/bad/src/lib/log.ts`:

```ts
console.log('user signed in', { email: u.email });
console.error('payment failed for', user.phone);
analytics.track('signup_complete', { email: u.email });
```

- [ ] **Step 2: Append failing test**

```ts
import { scanH_4_2_NoPIIInLogs } from './scanners.js';

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
```

- [ ] **Step 3: Run, verify failing**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement scanner**

Append to `cli/src/security/scanners.ts`:

```ts
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

  // For each PII identifier, find log calls that include it.
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
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/security/scanners.ts cli/src/security/scanners.test.ts cli/src/security/fixtures/H.4.2/
git commit -m "[MYC] scanner H.4.2 — no PII in logs"
```

---

### Task 22: Implement scanner H.4.4 (PII columns annotated)

**Files:**
- Modify: `cli/src/security/scanners.ts`
- Modify: `cli/src/security/scanners.test.ts`
- Create: `cli/src/security/fixtures/H.4.4/good/supabase/migrations/001_init.sql`
- Create: `cli/src/security/fixtures/H.4.4/bad/supabase/migrations/001_init.sql`

- [ ] **Step 1: Create fixtures**

`cli/src/security/fixtures/H.4.4/good/supabase/migrations/001_init.sql`:

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,    -- @pii email
  phone text,             -- @pii phone
  legal_name text         -- @pii name
);
```

`cli/src/security/fixtures/H.4.4/bad/supabase/migrations/001_init.sql`:

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  phone text,
  legal_name text
);
```

- [ ] **Step 2: Append failing test**

```ts
import { scanH_4_4_PIIColumnsAnnotated } from './scanners.js';

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
```

- [ ] **Step 3: Run, verify failing**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement scanner**

Append to `cli/src/security/scanners.ts`:

```ts
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
      // Match column declarations: <name> <type> ...
      // Only look inside CREATE TABLE blocks (heuristic: skip if no recent CREATE TABLE seen).
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
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd cli && npm test -- src/security/scanners.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/security/scanners.ts cli/src/security/scanners.test.ts cli/src/security/fixtures/H.4.4/
git commit -m "[MYC] scanner H.4.4 — PII columns annotated"
```

---

### Task 23: Wire registry consistency check into framework build

**Files:**
- Modify: `cli/src/security/scanners.ts` (already imports register)
- Create: `cli/scripts/check-registry.ts`
- Modify: `cli/package.json`

- [ ] **Step 1: Create the build-time check script**

Create `cli/scripts/check-registry.ts`:

```ts
// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Build-time check: every rule ID in any stack appendix's securityRules
// has a registered scanner (or is documentation-only); every scanner
// appears in at least one appendix. Fails build on mismatch.

import './../src/security/scanners.js'; // side-effect: registers scanners
import { assertRegistryConsistency } from '../src/security/registry.js';
import { STACKS } from '../src/stacks/index.js';

try {
  assertRegistryConsistency(STACKS);
  console.log('✓ Scanner registry consistent with stack appendices.');
} catch (err: any) {
  console.error('✗ Registry consistency failure:');
  console.error(`  ${err.message}`);
  process.exit(1);
}
```

- [ ] **Step 2: Wire into npm scripts**

Edit `cli/package.json`. Update the `scripts` block:

```json
"scripts": {
  "build": "tsc && node --loader=ts-node/esm scripts/check-registry.ts",
  "build:tsc": "tsc",
  "dev": "tsc --watch",
  "start": "node dist/index.js",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Note: this requires `ts-node` as a dev dep. Add it:

```json
"ts-node": "^10.9.0"
```

Then install:

```bash
cd cli && npm install --legacy-peer-deps
```

- [ ] **Step 3: Run the build**

```bash
cd cli && npm run build
```

Expected: tsc passes, then check-registry runs and prints "✓ Scanner registry consistent with stack appendices."

- [ ] **Step 4: Verify mismatch fails**

Temporarily add a fake rule reference. Edit `cli/src/stacks/appendix.expo-supabase.ts`. In `SECURITY_RULES`, add a fake header `##### H.9.9 Fake rule [demo]` line. Run build:

```bash
cd cli && npm run build
```

Expected: FAIL with "Stack 'expo-supabase' mentions rule H.9.9 in §H but no scanner is registered."

Revert the change:

```bash
git checkout cli/src/stacks/appendix.expo-supabase.ts
```

Run build again:

```bash
cd cli && npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/scripts/check-registry.ts cli/package.json cli/package-lock.json
git commit -m "[MYC] build-time scanner registry consistency check"
```

---

### Task 24: Integrate scanners into `mycelium contracts audit`

**Files:**
- Modify: `cli/src/commands/contracts.ts`

- [ ] **Step 1: Import scanner machinery + types**

In `cli/src/commands/contracts.ts`, add to top imports:

```ts
import './../security/scanners.js'; // side-effect: registers scanners
import { SCANNER_REGISTRY } from '../security/registry.js';
import {
  type Finding,
  type SecurityTier,
  type SecurityAllowlistEntry,
  isSecurityTier,
  TIER_RANK,
} from '../security/types.js';
```

- [ ] **Step 2: Add scanner runner + filter helpers**

Below the imports in `cli/src/commands/contracts.ts`, add:

```ts
async function runAllScanners(cwd: string): Promise<Finding[]> {
  const all: Finding[] = [];
  for (const [ruleId, scanner] of Object.entries(SCANNER_REGISTRY)) {
    try {
      const findings = await scanner(cwd);
      all.push(...findings);
    } catch (err: any) {
      console.error(
        chalk.yellow(`  ⚠️  scanner ${ruleId} crashed: ${err?.message ?? err}`)
      );
    }
  }
  return all;
}

/** True when current date is on or before expires (YYYY-MM-DD). */
function allowlistActive(entry: SecurityAllowlistEntry): boolean {
  return new Date().toISOString().slice(0, 10) <= entry.expires;
}

function micromatchSafe(file: string, pattern: string): boolean {
  // Lightweight glob: ** matches any segments; * matches one segment.
  // Sufficient for v1; replace with `micromatch` if needed.
  const re = new RegExp(
    '^' +
      pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*') +
      '$'
  );
  return re.test(file);
}

function applyAllowlistAndTier(
  findings: Finding[],
  tier: SecurityTier,
  allowlist: SecurityAllowlistEntry[]
): Finding[] {
  return findings.map((f): Finding => {
    // Allowlist match (always-block rules cannot be allowlisted).
    if (f.ruleTier !== 'always-block') {
      const match = allowlist.find((entry) => {
        if (!allowlistActive(entry)) return false;
        if (entry.rule !== f.ruleId) return false;
        if (entry.pattern) {
          // Pattern allowlists work on advisory rules only.
          if (f.ruleTier === 'startup' || f.ruleTier === 'regulated') return false;
          return micromatchSafe(f.file, entry.pattern);
        }
        return true;
      });
      if (match) {
        return { ...f, severity: 'allowlisted', allowlistedBy: match };
      }
    }

    // Tier modulation. always-block stays "block" everywhere.
    if (f.ruleTier === 'always-block') return { ...f, severity: 'block' };

    // Demo-tagged rule at demo tier → advisory; at startup/regulated → block.
    // Startup-tagged rule at startup/regulated → block.
    // Regulated-tagged rule at regulated → block; at startup/demo doesn't fire (tier filter below).
    const ruleRank = TIER_RANK[f.ruleTier];
    const activeRank = TIER_RANK[tier];
    if (ruleRank > activeRank) {
      // Rule's tier exceeds active tier; suppress (shouldn't typically reach here
      // because scanners shouldn't run for inactive rules, but defensive).
      return { ...f, severity: 'allowlisted' };
    }
    if (f.ruleTier === 'demo' && tier === 'demo') {
      return { ...f, severity: 'advisory' };
    }
    return { ...f, severity: 'block' };
  });
}
```

- [ ] **Step 3: Plumb tier + allowlist into runAudit**

In `cli/src/commands/contracts.ts`, find the `runAudit` function. After the `stack` resolution and before `renderedAppendix`, add:

```ts
  // Read security tier and allowlist from yaml.
  let yamlConfig: any = {};
  try {
    yamlConfig = YAML.parse(fs.readFileSync(myceliumYamlPath, 'utf-8'));
  } catch {}
  const tierRaw = yamlConfig?.organism?.security_tier;
  const securityTier: SecurityTier = isSecurityTier(tierRaw) ? tierRaw : 'demo';
  const allowlist: SecurityAllowlistEntry[] = Array.isArray(
    yamlConfig?.organism?.security_allowlist
  )
    ? yamlConfig.organism.security_allowlist
    : [];

  // Run scanners and apply tier modulation + allowlist filter.
  spinner.text = chalk.cyan('Running security scanners...');
  const rawFindings = await runAllScanners(cwd);
  const findings = applyAllowlistAndTier(rawFindings, securityTier, allowlist);
  const blockingFindings = findings.filter((f) => f.severity === 'block');
  const advisoryFindings = findings.filter((f) => f.severity === 'advisory');
  const allowlistedFindings = findings.filter((f) => f.severity === 'allowlisted');
```

- [ ] **Step 4: Add findings to the audit prompt**

In the same function, find where `prompt = buildAuditPrompt(...)` is called. Update the call:

```ts
  const prompt = buildAuditPrompt({
    fix,
    nutrientsPath,
    cwd,
    stackName: stack.name,
    renderedAppendix,
    securityTier,
    blockingFindings,
    advisoryFindings,
    allowlistedFindings,
  });
```

Update `buildAuditPrompt`'s signature (find the function declaration and update its arg type):

```ts
function buildAuditPrompt(args: {
  fix: boolean;
  nutrientsPath: string;
  cwd: string;
  stackName: string;
  renderedAppendix: string;
  securityTier: SecurityTier;
  blockingFindings: Finding[];
  advisoryFindings: Finding[];
  allowlistedFindings: Finding[];
}): string {
  const {
    fix, nutrientsPath, stackName, renderedAppendix, securityTier,
    blockingFindings, advisoryFindings, allowlistedFindings
  } = args;
```

- [ ] **Step 5: Inject findings block into the audit prompt**

Inside `buildAuditPrompt`, after the existing prompt body, before the closing template literal backtick, add a "Pre-computed security findings" section:

Find the line near the end of the prompt:

```
END SOURCE-OF-TRUTH APPENDIX
─────────────────────────────────────────────────────────────────────────`;
```

Right before that closing block, insert:

```
─────────────────────────────────────────────────────────────────────────
PRE-COMPUTED SECURITY FINDINGS (tier: ${securityTier})

The following findings were produced by deterministic scanners running
over the cultivation source. Include them VERBATIM in your audit report
under "## 8. Security findings". Do not run grep yourself — the findings
below are authoritative.

### Blocking violations (${blockingFindings.length}):
${
  blockingFindings.length === 0
    ? '(none)'
    : blockingFindings
        .map(
          (f) =>
            `- ${f.ruleId} [${f.ruleTier}${f.stackTag ? `, ${f.stackTag}` : ''}]: ${f.file}${f.match ? ` — ${f.match}` : ''}`
        )
        .join('\n')
}

### Advisories (${advisoryFindings.length}):
${
  advisoryFindings.length === 0
    ? '(none)'
    : advisoryFindings
        .map(
          (f) =>
            `- ${f.ruleId} [${f.ruleTier}${f.stackTag ? `, ${f.stackTag}` : ''}]: ${f.file}${f.match ? ` — ${f.match}` : ''}`
        )
        .join('\n')
}

### Allowlisted (${allowlistedFindings.length}):
${
  allowlistedFindings.length === 0
    ? '(none)'
    : allowlistedFindings
        .map(
          (f) =>
            `- ${f.ruleId}: ${f.file} (allowlist: ${f.allowlistedBy?.reason ?? 'n/a'}, expires ${f.allowlistedBy?.expires ?? 'n/a'})`
        )
        .join('\n')
}
─────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 6: Update audit pass/fail logic**

In `runAudit`, find where the agent's PASS/FAIL marker is matched. Currently the agent decides PASS/FAIL based on its analysis. We now add a deterministic floor: if any blocking finding exists, exit code MUST be non-zero, regardless of what the agent said.

Find:

```ts
  const passed = /AUDIT PASS\b/.test(lastText);
  const failed = /AUDIT FAIL\b/.test(lastText);
```

Replace with:

```ts
  // Deterministic floor: any blocking finding fails the audit regardless of agent verdict.
  const blockedBySecurityScanners = blockingFindings.length > 0;
  const passed = !blockedBySecurityScanners && /AUDIT PASS\b/.test(lastText);
  const failed = blockedBySecurityScanners || /AUDIT FAIL\b/.test(lastText);
```

- [ ] **Step 7: Build + run existing audit prompt path**

```bash
cd cli && npm run build
```

Expected: PASS.

- [ ] **Step 8: Smoke-test against live-grid-run3 (which has no §H content yet)**

```bash
cd cli && node dist/index.js contracts audit -d /Users/spy/mfautomation/repos/live-grid-run3 --stack expo-supabase 2>&1 | tail -30
```

Expected: audit runs, scanners produce findings (likely H.2.2 from raw AsyncStorage in run3, possibly H.4.2 from console.log), agent receives them and reports.

- [ ] **Step 9: Commit**

```bash
git add cli/src/commands/contracts.ts
git commit -m "[MYC] audit integrates security scanners + tier modulation"
```

---

### Task 25: M2 acceptance — full pipeline against a fresh cultivation

**Files:** none modified.

- [ ] **Step 1: Create a fresh test cultivation**

```bash
mkdir -p /Users/spy/mfautomation/repos/live-grid-run4 && cd /Users/spy/mfautomation/repos/live-grid-run4 && git init -q && cp /Users/spy/mfautomation/repos/live-grid/brief.stripped.md ./brief.md
```

- [ ] **Step 2: Plant at startup tier**

```bash
cd /Users/spy/mfautomation/repos/live-grid-run4 && mycelium plant brief.md --stack expo-supabase --security startup
```

Expected: planter completes; mycelium.yaml has `security_tier: startup`; NUTRIENTS.md has §H block including all 19 rule IDs.

- [ ] **Step 3: Audit the fresh cultivation**

```bash
cd /Users/spy/mfautomation/repos/live-grid-run4 && mycelium contracts audit
```

Expected: scanners run; report shows findings (count + categories); PASS/FAIL marker; exit code reflects pass/fail.

- [ ] **Step 4: M2 milestone tag**

```bash
cd /Users/spy/mfautomation/repos/legendary-funicular && git tag m2-section-h-scanners
git log --oneline | head -20
```

M2 complete: §H rules now enforced via deterministic scanners with tier modulation and allowlist filtering.

---

# M3 — Lifecycle (8 tasks)

Goal: tier promotion via dedicated subcommand, downgrade detection with audit-trail enforcement, allowlist expiry warnings.

### Task 26: Add `mycelium contracts upgrade-tier` subcommand

**Files:**
- Modify: `cli/src/commands/contracts.ts`

- [ ] **Step 1: Register subcommand**

In `cli/src/commands/contracts.ts`, find the existing `contracts.command("audit")` block. After the audit subcommand block (before `contracts.command("freeze")`), add:

```ts
  contracts
    .command("upgrade-tier <new-tier>")
    .description(
      "🔼 Promote security tier (demo → startup → regulated). Rewrites mycelium.yaml + re-renders §H of NUTRIENTS."
    )
    .action(async (newTierRaw: string) => {
      await runUpgradeTier(process.cwd(), newTierRaw);
    });
```

- [ ] **Step 2: Implement runUpgradeTier**

Below the existing `runAudit` function in the same file, add:

```ts
async function runUpgradeTier(cwd: string, newTierRaw: string): Promise<void> {
  if (!isSecurityTier(newTierRaw)) {
    console.log(
      chalk.red(`  ❌ Invalid tier "${newTierRaw}". Available: demo, startup, regulated`)
    );
    process.exit(1);
  }
  const newTier = newTierRaw as SecurityTier;
  const yamlPath = path.join(cwd, 'mycelium.yaml');
  const nutrientsPath = path.join(cwd, 'NUTRIENTS.md');
  if (!fs.existsSync(yamlPath)) {
    console.log(chalk.red('  ❌ mycelium.yaml not found.'));
    process.exit(1);
  }
  const config = YAML.parse(fs.readFileSync(yamlPath, 'utf-8'));
  const currentTierRaw = config?.organism?.security_tier;
  if (!isSecurityTier(currentTierRaw)) {
    console.log(
      chalk.red('  ❌ mycelium.yaml has no organism.security_tier — re-plant with --security.')
    );
    process.exit(1);
  }
  const currentTier = currentTierRaw as SecurityTier;

  if (TIER_RANK[newTier] <= TIER_RANK[currentTier]) {
    console.log(
      chalk.red(
        `  ❌ Cannot ${newTier === currentTier ? 'remain at' : 'downgrade to'} ${newTier} (current: ${currentTier}).`
      )
    );
    if (newTier !== currentTier) {
      console.log(
        chalk.gray(
          '     Downgrades require manual mycelium.yaml edit + a SECURITY-DOWNGRADE.md file (see docs).'
        )
      );
    }
    process.exit(1);
  }

  // Resolve stack to re-render §H.
  const stackName = config?.organism?.stack;
  const stack = stackName ? getStack(stackName) : null;
  if (!stack) {
    console.log(
      chalk.red(`  ❌ Cannot resolve stack "${stackName}" from yaml.`)
    );
    process.exit(1);
  }

  // Update yaml.
  config.organism.security_tier = newTier;
  fs.writeFileSync(
    yamlPath,
    '# Mycelium Framework — VibeSpace LLC — The network provides.\n\n' +
      YAML.stringify(config),
    'utf-8'
  );

  // Re-render §H in NUTRIENTS.md by replacing the existing H. block with the
  // current stack appendix's securityRules. The render uses the same heading
  // `### H. Security Rules` as renderContractAppendix.
  if (fs.existsSync(nutrientsPath)) {
    const nutrients = fs.readFileSync(nutrientsPath, 'utf-8');
    // Match `### H. Security Rules` heading + everything until the next top-level
    // section starting with `## ` or end of file.
    const hSectionRe = /### H\. Security Rules[\s\S]*?(?=\n##\s|\n# |$)/;
    const newH = `### H. Security Rules\n\n${stack.contractAppendix.securityRules}`;
    const updated = hSectionRe.test(nutrients)
      ? nutrients.replace(hSectionRe, newH)
      : nutrients + '\n\n' + newH;
    fs.writeFileSync(nutrientsPath, updated, 'utf-8');
  }

  console.log(
    chalk.greenBright(
      `  ✓ Upgraded security_tier: ${currentTier} → ${newTier}`
    )
  );
  console.log(
    chalk.gray(
      `     Run \`mycelium contracts audit\` to see what now blocks freeze.`
    )
  );
}
```

- [ ] **Step 3: Build**

```bash
cd cli && npm run build
```

Expected: PASS.

- [ ] **Step 4: Test upgrade-tier**

```bash
cd cli && node dist/index.js contracts upgrade-tier --help
```

Expected: shows the new subcommand help.

- [ ] **Step 5: Commit**

```bash
git add cli/src/commands/contracts.ts
git commit -m "[MYC] mycelium contracts upgrade-tier subcommand"
```

---

### Task 27: Test upgrade-tier against live cultivation

**Files:** none modified.

- [ ] **Step 1: Use live-grid-run4 (M2 acceptance test)**

```bash
cd /Users/spy/mfautomation/repos/live-grid-run4 && grep -E "security_tier" mycelium.yaml && grep -c "### H\. Security Rules" NUTRIENTS.md
```

Expected: shows current tier (`startup`) and confirms §H heading exists.

- [ ] **Step 2: Try downgrade — should fail**

```bash
cd /Users/spy/mfautomation/repos/live-grid-run4 && mycelium contracts upgrade-tier demo
```

Expected: red error "Cannot downgrade to demo".

- [ ] **Step 3: Try same-tier — should fail**

```bash
mycelium contracts upgrade-tier startup
```

Expected: red error "Cannot remain at startup".

- [ ] **Step 4: Upgrade to regulated**

```bash
mycelium contracts upgrade-tier regulated
```

Expected: green confirmation; yaml updated; §H re-rendered in NUTRIENTS.md.

- [ ] **Step 5: Verify diff**

```bash
cd /Users/spy/mfautomation/repos/live-grid-run4 && git diff mycelium.yaml | head -10
```

Expected: shows `security_tier: startup` → `security_tier: regulated` only.

- [ ] **Step 6: Reset back to startup for further testing**

```bash
# Manual revert (downgrade not allowed via CLI):
sed -i '' 's/security_tier: regulated/security_tier: startup/' mycelium.yaml
```

---

### Task 28: Implement downgrade detection via git log

**Files:**
- Modify: `cli/src/commands/contracts.ts`

- [ ] **Step 1: Add git-log walker for prior tier values**

In `cli/src/commands/contracts.ts`, below `runUpgradeTier`, add:

```ts
function findPriorSecurityTier(cwd: string): SecurityTier | null {
  // Walk git log for mycelium.yaml; find the highest organism.security_tier
  // ever recorded in committed history.
  try {
    const log = execFileSync('git', ['log', '--pretty=format:%H', '--', 'mycelium.yaml'], {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    const shas = log.split('\n').filter((l) => l.length > 0);
    let highest: SecurityTier | null = null;
    for (const sha of shas) {
      try {
        const content = execFileSync(
          'git',
          ['show', `${sha}:mycelium.yaml`],
          { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        );
        const cfg = YAML.parse(content);
        const tier = cfg?.organism?.security_tier;
        if (isSecurityTier(tier)) {
          if (!highest || TIER_RANK[tier] > TIER_RANK[highest]) {
            highest = tier;
          }
        }
      } catch {
        continue;
      }
    }
    return highest;
  } catch {
    return null;
  }
}
```

The import for `execFileSync` already exists at the top of the file in M2's audit changes. If not, add:

```ts
import { execFileSync } from 'node:child_process';
```

- [ ] **Step 2: Plumb downgrade check into runAudit**

In `runAudit`, after the security tier is resolved (the `securityTier` variable from Task 24's Step 3), and before scanners run, add:

```ts
  // Downgrade detection: compare current tier against the highest tier ever
  // committed in git history. If lower AND no SECURITY-DOWNGRADE.md exists
  // referencing the new tier, hard-fail the audit.
  const priorTier = findPriorSecurityTier(cwd);
  if (priorTier && TIER_RANK[securityTier] < TIER_RANK[priorTier]) {
    const downgradePath = path.join(cwd, 'SECURITY-DOWNGRADE.md');
    const downgradeOk =
      fs.existsSync(downgradePath) &&
      fs.readFileSync(downgradePath, 'utf-8').includes(securityTier);
    if (!downgradeOk) {
      spinner.fail(chalk.red('SECURITY DOWNGRADE UNDOCUMENTED'));
      console.log();
      console.log(
        chalk.red(
          `  ❌ security_tier downgraded ${priorTier} → ${securityTier} but no SECURITY-DOWNGRADE.md exists referencing the new tier.`
        )
      );
      console.log(
        chalk.gray(
          `     Create SECURITY-DOWNGRADE.md at the cultivation root with: timestamp, prior tier, new tier, operator note explaining why.`
        )
      );
      return { passed: false, exitCode: 4, summary: 'undocumented downgrade' };
    }
  }
```

- [ ] **Step 3: Build**

```bash
cd cli && npm run build
```

Expected: PASS.

- [ ] **Step 4: Test downgrade detection**

In `live-grid-run4`, simulate a downgrade by manually editing mycelium.yaml to demo and running audit:

```bash
cd /Users/spy/mfautomation/repos/live-grid-run4 && git add -A && git commit -m "[LG] startup tier baseline" 2>&1 | tail -3 && sed -i '' 's/security_tier: startup/security_tier: demo/' mycelium.yaml && mycelium contracts audit 2>&1 | tail -10
```

Expected: audit fails with "SECURITY DOWNGRADE UNDOCUMENTED" and exit code 4.

- [ ] **Step 5: Test that downgrade doc unblocks**

```bash
cd /Users/spy/mfautomation/repos/live-grid-run4 && cat > SECURITY-DOWNGRADE.md <<'EOF'
# Security Tier Downgrade

Date: 2026-05-08
Prior tier: startup
New tier: demo
Operator: SPY
Reason: smoke-testing the downgrade detection mechanism.
EOF
mycelium contracts audit 2>&1 | tail -5
```

Expected: audit no longer blocks on downgrade; runs through scanner findings normally.

- [ ] **Step 6: Restore startup tier for cleanliness**

```bash
sed -i '' 's/security_tier: demo/security_tier: startup/' mycelium.yaml && rm SECURITY-DOWNGRADE.md
```

- [ ] **Step 7: Commit**

```bash
cd /Users/spy/mfautomation/repos/legendary-funicular && git add cli/src/commands/contracts.ts
git commit -m "[MYC] downgrade detection via git log + SECURITY-DOWNGRADE.md gate"
```

---

### Task 29: Add allowlist expiry warnings + EXPIRED ALLOWLIST markers

**Files:**
- Modify: `cli/src/commands/contracts.ts`

- [ ] **Step 1: Compute expiry buckets**

In `cli/src/commands/contracts.ts`, after the allowlist is read in `runAudit` (Task 24's Step 3), add:

```ts
  // Categorize allowlist entries by expiry status.
  const today = new Date();
  const fourteenDaysOut = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);
  const expiredAllowlists = allowlist.filter((e) => e.expires < todayStr);
  const expiringSoonAllowlists = allowlist.filter(
    (e) => e.expires >= todayStr && e.expires < fourteenDaysOut
  );
```

- [ ] **Step 2: Pass these into the audit prompt**

Update the `buildAuditPrompt` call to include them:

```ts
  const prompt = buildAuditPrompt({
    fix,
    nutrientsPath,
    cwd,
    stackName: stack.name,
    renderedAppendix,
    securityTier,
    blockingFindings,
    advisoryFindings,
    allowlistedFindings,
    expiringSoonAllowlists,
    expiredAllowlists,
  });
```

Update `buildAuditPrompt`'s signature accordingly:

```ts
function buildAuditPrompt(args: {
  fix: boolean;
  nutrientsPath: string;
  cwd: string;
  stackName: string;
  renderedAppendix: string;
  securityTier: SecurityTier;
  blockingFindings: Finding[];
  advisoryFindings: Finding[];
  allowlistedFindings: Finding[];
  expiringSoonAllowlists: SecurityAllowlistEntry[];
  expiredAllowlists: SecurityAllowlistEntry[];
}): string {
  const {
    fix, nutrientsPath, stackName, renderedAppendix, securityTier,
    blockingFindings, advisoryFindings, allowlistedFindings,
    expiringSoonAllowlists, expiredAllowlists,
  } = args;
```

- [ ] **Step 3: Add expiry bucket sections to prompt**

In `buildAuditPrompt`, in the same "PRE-COMPUTED SECURITY FINDINGS" block from Task 24's Step 5, after the `### Allowlisted` section, append:

```
### Expiring within 14 days (${expiringSoonAllowlists.length}):
${
  expiringSoonAllowlists.length === 0
    ? '(none)'
    : expiringSoonAllowlists
        .map((e) => `- ${e.rule}: ${e.reason} (expires ${e.expires})`)
        .join('\n')
}

### EXPIRED ALLOWLISTS (${expiredAllowlists.length}):
${
  expiredAllowlists.length === 0
    ? '(none)'
    : expiredAllowlists
        .map((e) => `- ${e.rule}: ${e.reason} (expired ${e.expires}) — original findings now active`)
        .join('\n')
}
```

- [ ] **Step 4: Build**

```bash
cd cli && npm run build
```

Expected: PASS.

- [ ] **Step 5: Smoke-test allowlist expiry**

In live-grid-run4, add a synthetic allowlist with expired date:

```bash
cd /Users/spy/mfautomation/repos/live-grid-run4 && cat >> mycelium.yaml <<'EOF'
  security_allowlist:
    - rule: H.4.2
      reason: "Test fixtures contain sample emails"
      expires: 2025-01-01
    - rule: H.1.4
      reason: "Secret manager rollout deferred"
      expires: 2026-12-01
EOF
mycelium contracts audit 2>&1 | grep -E "EXPIRED|expir" | head
```

Expected: report shows H.4.2 as "EXPIRED ALLOWLIST" and H.1.4 as active or expiring-soon depending on today's date.

- [ ] **Step 6: Clean up test allowlist**

```bash
# remove the security_allowlist block we just added
git checkout mycelium.yaml 2>/dev/null || sed -i '' '/security_allowlist:/,$d' mycelium.yaml
```

- [ ] **Step 7: Commit**

```bash
cd /Users/spy/mfautomation/repos/legendary-funicular && git add cli/src/commands/contracts.ts
git commit -m "[MYC] allowlist expiry warnings + EXPIRED ALLOWLIST markers"
```

---

### Task 30: M3 acceptance — full lifecycle test

**Files:** none modified.

- [ ] **Step 1: Fresh demo cultivation**

```bash
mkdir -p /Users/spy/mfautomation/repos/live-grid-run5-lifecycle && cd /Users/spy/mfautomation/repos/live-grid-run5-lifecycle && git init -q && cp /Users/spy/mfautomation/repos/live-grid/brief.stripped.md ./brief.md && mycelium plant brief.md --stack expo-supabase --security demo
```

Expected: planted at demo tier; mycelium.yaml has `security_tier: demo`.

- [ ] **Step 2: Initial audit at demo**

```bash
mycelium contracts audit 2>&1 | tail -10
```

Expected: audit runs; advisories visible; freeze NOT blocked unless catastrophic findings.

- [ ] **Step 3: Promote to startup**

```bash
mycelium contracts upgrade-tier startup
```

Expected: green confirmation; yaml + NUTRIENTS updated.

- [ ] **Step 4: Re-audit at startup**

```bash
mycelium contracts audit 2>&1 | tail -10
```

Expected: same scanner findings, but former advisories now blocking.

- [ ] **Step 5: Commit baseline + simulate downgrade**

```bash
git add -A && git commit -q -m "[LG] startup baseline" && sed -i '' 's/security_tier: startup/security_tier: demo/' mycelium.yaml && mycelium contracts audit 2>&1 | grep "SECURITY DOWNGRADE"
```

Expected: shows "SECURITY DOWNGRADE UNDOCUMENTED" and audit fails.

- [ ] **Step 6: M3 milestone tag**

```bash
cd /Users/spy/mfautomation/repos/legendary-funicular && git tag m3-section-h-lifecycle
git log --oneline | head -25
```

M3 complete: tier promotion, downgrade detection, allowlist expiry — all functional.

---

## Self-review checklist

Run through after all tasks complete:

- [ ] Every rule ID in §H of expo-supabase appendix has a scanner OR is in DOCUMENTATION_ONLY (registry consistency check passes).
- [ ] `npm test` passes all scanner tests + tier modulation tests.
- [ ] `mycelium plant --stack expo-supabase --security demo` succeeds; `--security` omitted hard-fails.
- [ ] `mycelium contracts audit` against live-grid-run4 produces actionable findings.
- [ ] `mycelium contracts upgrade-tier` works one-way; rejects same-tier and downgrade.
- [ ] Manual yaml downgrade is detected and blocked unless `SECURITY-DOWNGRADE.md` exists.
- [ ] Allowlist entries with past expiry show as `EXPIRED ALLOWLIST` in audit reports.

## Anticipated follow-up (M4, separate plan post-run-4)

- Scanner refinements based on false-positive observations from run-4 / run-5.
- New rule candidates surfaced from real cultivations.
- Optional: replace regex SQL parsing in H.3.1 / H.3.2 / H.4.4 with `ts-pg-parse` for stricter coverage.
- Optional: replace H.4.2 / H.4.3 regex with TS AST scanner (track variable types tagged @pii through call sites).
