# Section H — Framework-Level Security Contracts

| | |
|---|---|
| **Date** | 2026-05-08 |
| **Status** | Design approved; awaiting user review of written spec |
| **Subsystem** | Framework-level security contracts (1 of 3 in the security workstream) |
| **Stack** | Adds to legendary-funicular `cli/src/stacks/*` and `cli/src/commands/*` |
| **Stream tag** | `MYC/` |
| **Related** | Builds on §A–§G of the contract appendix shipped in 2026-05-07 / 2026-05-08 hardening |
| **Out of scope** | Security audit gate (subsystem 2) and operator/CLI security (subsystem 3) — separate specs |

## 1. Background & motivation

The contract appendix shipped in run-3 hardening covers seven subsections (A–G) that prevent contract-drift failures (missing deps, prop drift, style typing, icon-name drift, duplicate barrels, black-screen boot, deliverable mismatches). It contains exactly **one** security-adjacent rule (§F.7 — service-client placeholder fallback for demo cultivations).

The framework now produces cultivations destined for production — Bardot launches Nov 2026 with real customers and payment data; LiveGrid Track 2 will follow with users and PII. Without a security contract layer, every cultivation reinvents (or forgets) protections at leaf level. Empirically, leaves shipped in run-3 already manifested security-relevant patterns:

- `auth` biome stored Supabase tokens in AsyncStorage (plaintext-equivalent on iOS)
- `app-shell` biome's `supabase.ts` initially threw on missing env vars (mitigated post-hoc with §F.7)
- No verification that Supabase tables had RLS enabled
- No rules about PII appearing in console.log or error messages

Section H is the framework-level security contract that propagates to every cultivation, parallel in shape to §A–§G but covering the security domain.

## 2. Out of scope (this spec)

Three security subsystems were identified during brainstorming. This spec covers only the first.

- **(2) Audit gate extended for security posture** — the actual scanning + enforcement layer that consumes Section H rules. Implementation overlaps with this spec but is its own work; addressed only at the architectural level here.
- **(3) Operator/CLI security hardening** — secrets handling inside `mycelium plant`/`cultivate`, leaf log sanitization, branch protection defaults. Separate spec.
- **Per-product application security** — LiveGrid's escrow integrity, Bardot's reservation flow protections, etc. Implemented per-cultivation; constrained by but not authored at this framework layer.

## 3. Design

### 3.1 Data model & integration surface

Three additive code touchpoints, all parallel to existing patterns:

**`ContractAppendix` gains one new field** in `cli/src/stacks/index.ts`:

```ts
export interface ContractAppendix {
  // existing fields: preamble, dependencyManifest, primitiveProps,
  // baselineOwnership, barrelOwnership, allowlistedIdentifiers,
  // styleSystemRules, screenOwnershipMatrix
  securityRules: string;  // NEW — renders as §H of NUTRIENTS.md
}
```

`renderContractAppendix()` adds Section H rendering between §G and the closing of the appendix.

**`mycelium.yaml` gains one new key**:

```yaml
organism:
  name: <organism-name>
  stack: <stack-name>
  security_tier: 'demo' | 'startup' | 'regulated'   # NEW
  security_allowlist:                                # NEW — optional
    - rule: H.1.4
      reason: "Secrets in env vars only — secret manager rollout deferred to Q3"
      expires: 2026-09-01
    - pattern: "**/__tests__/**"                     # pattern-level (advisory rules only)
      rule: H.4.2
      reason: "Test fixtures contain synthetic emails as test data"
      expires: 2027-01-01
```

**`mycelium plant` gains one new flag**: `-S, --security <tier>`.

Behavior matches `--stack`:
- **First plant** of an organism (no `security_tier` in yaml yet) — flag is REQUIRED. Hard-fails with available tiers if omitted. Eliminates silent-weakening: forgetting the flag costs zero protection.
- **Subsequent plant** against an existing organism — flag is OPTIONAL. Reads recorded value from yaml. If flag is supplied AND differs from recorded value, the plant command rejects the input and points the operator to `mycelium contracts upgrade-tier <tier>`.

This shape parallels the `--stack` resolution introduced in run-3.

**Tier promotion uses the `upgrade-tier` subcommand, not `plant`**. Rationale: `plant` re-invokes the planner LLM (slow, costly, regenerates HYPHA + agents). A tier flip needs neither — it's just rewriting the yaml field and re-rendering §H from the current stack appendix (fast, cheap, deterministic). Forcing operators to `plant` for a tier change would burn tokens unnecessarily and risk the planner regenerating contracts the operator didn't intend to change. The `upgrade-tier` subcommand is the canonical path; `plant --security <new-tier>` is rejected with a pointer to it.

### 3.2 Section H content shape

Rendered structure:

```
## H. Security Rules

[preamble: tier explanations + supersetting + allowlist mechanics]

### H.1 Secret Management
#### H.1.1 No hardcoded secrets in committed code [always-block]
#### H.1.2 .env gitignored, .env.example committed [demo]
#### H.1.3 Service-role keys never reach client code [always-block]
#### H.1.4 Secrets sourced from a secret manager [startup]
#### H.1.5 Secret rotation runbook documented [regulated]

### H.2 Auth Flows
#### H.2.1 OAuth PKCE only — no implicit grant [demo]
#### H.2.2 Tokens in expo-secure-store via adapter; never raw AsyncStorage [demo, expo-supabase]
#### H.2.3 Session refresh with rotating tokens [startup]
#### H.2.4 Short-lived access tokens (<1hr) [regulated]

### H.3 Database (RLS)
#### H.3.1 Every Supabase table has RLS enabled [always-block]
#### H.3.2 No table grants SELECT * to anon role [demo]
#### H.3.3 Explicit policies per role on every table [startup]
#### H.3.4 service_role only in server functions [demo]
#### H.3.5 Row-level audit trail on PII tables [regulated]

### H.4 PII Handling
#### H.4.1 PII categories defined (email/phone/address/payment/legal name/location) [demo]
#### H.4.2 No PII in console.log or analytics events [demo]
#### H.4.3 Error messages sanitize PII; user IDs only [startup]
#### H.4.4 PII columns annotated for audit detection [startup]
#### H.4.5 PII access logged with role + reason [regulated]
```

**Tier marker syntax**:
- `[demo]` = applies starting at demo (i.e., everywhere). Modulated: warns at demo, blocks at startup+.
- `[startup]` = applies starting at startup (i.e., startup + regulated). Always blocks.
- `[regulated]` = applies only at regulated. Always blocks.
- `[always-block]` = catastrophic floor. Blocks at every tier including demo. Cannot be allowlisted.
- Stack-specific addenda use a second tag: `[demo, expo-supabase]`. Stack appendices contribute these inline.

The supersetting `+` is implicit. `[demo]` rules apply at all three tiers; `[startup]` at the upper two.

**Rule IDs** (`H.1.1`, `H.2.3`, etc.) are stable. They become the allowlist key (`--security-allowlist H.1.4` → exempts that rule pending the allowlist's expiry).

**Catastrophic floor (`[always-block]`)**:
- H.1.1 — no real keys committed
- H.1.3 — service-role keys not in client code
- H.3.1 — RLS enabled on every table

Three rules at the floor. Cannot be allowlisted. Cannot be suppressed by tier. The reasoning: demos get committed, pushed, shown to investors. A real `sk_live_*` in demo code has the same blast radius as production. The catastrophic subset is the rules where the cost of being wrong is severe enough that no tier should permit it.

**Per-rule body shape** — every rule has three lines:

```markdown
#### H.1.1 No hardcoded secrets in committed code [always-block]
Rule: No real API keys, tokens, or credentials in committed source. Exempt:
  literals containing the substring `placeholder` matching §F.7 demo-stub
  patterns.
Audit: `grep -rEn 'sk_live_|sk_test_|eyJ[A-Za-z0-9]{30,}|service_role|AKIA[0-9A-Z]{16}'
  src/ supabase/ | grep -v 'placeholder'` returns zero matches.
Violation: freeze-block at all tiers.
```

For SQL-parse rules, `Audit:` is a fenced description rather than a one-liner — the markdown shape accommodates either:

```markdown
#### H.3.1 Every Supabase table has RLS enabled [always-block]
Rule: Every `CREATE TABLE` in supabase/migrations/*.sql is followed by an
  `ALTER TABLE … ENABLE ROW LEVEL SECURITY` within the same migration file.
Audit: parse migration SQL; for each CREATE TABLE, verify a corresponding
  ENABLE ROW LEVEL SECURITY statement exists. (Implementation: regex-based
  for v1; ts-pg-parse for stricter coverage in v2.)
Violation: freeze-block at all tiers.
```

**§F.7 ↔ §H.1.1 contradiction resolution** (refinement to existing §F.7):

The §F.7 service-client demo-stub pattern shipped in run-3 mandates literals like `'placeholder-anon-key'`. §H.1.1 would otherwise flag those as hardcoded secrets. Resolution lives in two places:

1. §F.7 wording tightens — fallback values MUST contain the literal substring `placeholder` (case-sensitive). This makes the audit's secret scanner regex-narrow.
2. §H.1.1 carries an explicit exemption: literals matching the §F.7 placeholder pattern are exempt from the secret scanner.

Both rules in the same NUTRIENTS now agree in writing.

**§F.7 ↔ §H.2.2 storage resolution** (Supabase Auth + expo-secure-store):

Supabase's `createClient({ auth: { storage: ... } })` standard pattern uses AsyncStorage. expo-secure-store has a 2KB-per-value limit; Supabase sessions (access + refresh JWT pair) routinely exceed that. Direct swap is broken.

Resolution: H.2.2 mandates an **adapter pattern** — a thin wrapper exposing the AsyncStorage interface but persisting via expo-secure-store, chunking values across multiple keys to bypass the 2KB ceiling. §F.7's example pattern is updated in v1 to demonstrate the adapter. Leaves consume the documented snippet directly:

```ts
// owner: app-shell — src/lib/secureStorage.ts
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800; // bytes; under expo-secure-store's 2KB limit

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const meta = await SecureStore.getItemAsync(`${key}__meta`);
    if (!meta) return null;
    const { chunks } = JSON.parse(meta);
    const parts = await Promise.all(
      Array.from({ length: chunks }, (_, i) => SecureStore.getItemAsync(`${key}__${i}`))
    );
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const chunks = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}__meta`, JSON.stringify({ chunks }));
    await Promise.all(
      Array.from({ length: chunks }, (_, i) =>
        SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))
      )
    );
  },
  async removeItem(key: string): Promise<void> {
    const meta = await SecureStore.getItemAsync(`${key}__meta`);
    if (!meta) return;
    const { chunks } = JSON.parse(meta);
    await Promise.all([
      SecureStore.deleteItemAsync(`${key}__meta`),
      ...Array.from({ length: chunks }, (_, i) => SecureStore.deleteItemAsync(`${key}__${i}`)),
    ]);
  },
};
```

§F.7 example becomes:

```ts
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
```

H.2.2's audit verifies that any `createClient({ auth: { storage: X } })` invocation passes either `secureStorageAdapter` or another expo-secure-store-backed adapter — never raw `AsyncStorage`.

### 3.3 Tier semantics & data flow

**Tier definitions** (ordered weakest → strongest: `demo < startup < regulated`):
- **demo** — Boot-grade. Catastrophic rules block; everything else advisory. Default for prototype cultivations and pre-customer demos.
- **startup** — Real-launch grade. All foundational-4 rules block. The default for any cultivation with a launch date.
- **regulated** — Compliance-grade. Adds audit trails, rotation runbooks, role-based PII access logging. Reserved for cultivations with explicit regulatory obligations.

The ordering is total: when a rule's tag says `[startup]`, "applies if tier marker ≤ active tier" means the rule applies at startup OR regulated. `[always-block]` is not a tier — it's a catastrophic-floor tag that activates regardless of the tier ordering.

**Tier propagation**:

```
mycelium plant <brief> --stack expo-supabase --security startup
   │
   ▼  records organism.security_tier in mycelium.yaml
   │  inserts §H block into NUTRIENTS.md with tier-active rules marked
   ▼
mycelium contracts audit
   │  reads organism.security_tier from yaml
   │  for each §H rule: applies if tier marker ≤ active tier OR [always-block]
   │  modulates: violation = freeze-block (startup+, always-block) OR warn (demo)
   ▼
mycelium contracts freeze
   │  runs audit; refuses on any blocking violation
   ▼
mycelium cultivate
   │  leaves consume frozen NUTRIENTS as before; §H is just more contract surface
```

Same shape as the existing audit/freeze flow. The tier is a single string read from yaml.

**Tier upgrades — one-way by default, downgrades enforced**:

A cultivation can move **up** tiers via `mycelium contracts upgrade-tier <new-tier>`. The CLI:
- validates `new-tier > current-tier` (rejects same-tier and downgrade)
- rewrites `mycelium.yaml`'s `organism.security_tier`
- re-renders `§H` of `NUTRIENTS.md` from the current stack's appendix
- prints reminder to run `mycelium contracts audit`

Going **down** requires:
1. Manual edit of `mycelium.yaml`
2. A `SECURITY-DOWNGRADE.md` file at the cultivation root with timestamp, prior tier, new tier, operator note
3. The audit detects this: it walks `git log` for prior values of `organism.security_tier` in `mycelium.yaml`. If the current value is below any prior value AND `SECURITY-DOWNGRADE.md` is missing OR doesn't reference the current downgrade, the audit fails with a specific marker (`SECURITY DOWNGRADE UNDOCUMENTED`). This makes the friction real, not aspirational.

### 3.4 Audit integration & error handling

This section spans into the audit-gate subsystem (#2, separate spec) but its architectural commitments are required here.

**Capability gap — source-scanning**:
The audit shipped in run-3 does markdown-vs-markdown verification. Section H rules require source-scanning: grep over `src/`, parse over `supabase/migrations/`, file-state checks on `.gitignore` and committed `.env`. This is a meaningful capability extension — the same shape as the deliverable-existence check added in run-3 ("does this file exist") extended to "does this file's contents satisfy this constraint."

**Architecture: deterministic scanners + agent triage**:

A new module `cli/src/security/scanners.ts` contains one function per rule ID. Each function takes `cwd` and returns `Finding[]`:

```ts
interface Finding {
  ruleId: string;          // e.g., 'H.1.1'
  file: string;            // e.g., 'src/lib/foo.ts:42'
  match?: string;          // matched text, redacted in report
  severity: 'block' | 'advisory' | 'allowlisted';
  ruleTier: 'always-block' | 'demo' | 'startup' | 'regulated';
  stackTag?: string;       // e.g., 'expo-supabase'
}

export function scanH_1_1_HardcodedSecrets(cwd: string): Finding[];
export function scanH_3_1_RLSCoverage(cwd: string): Finding[];
// ... one per rule ID
```

A registry in `cli/src/security/registry.ts` maps rule ID → scanner function. At framework build time, an assertion verifies:
- Every rule ID appearing in any stack appendix's `securityRules` field has a scanner registered.
- Every scanner in the registry has a corresponding rule ID in at least one stack appendix.

Mismatch fails `npm run build`. Solves the two-sources-of-truth risk: prose contracts and scanners stay in sync.

The audit subcommand:
1. Reads `organism.security_tier` and `organism.security_allowlist` from yaml.
2. Determines active rule set: every rule with tier ≤ active tier, plus all `[always-block]` rules.
3. Invokes registered scanner for each active rule. Collects all findings.
4. Applies allowlist filter: matches against active (non-expired) allowlist entries → severity `allowlisted`. Per-pattern allowlists (file globs) apply to advisory rules only; per-match allowlists work on all rules except `[always-block]`. Allowlists do NOT apply to `[always-block]` rules.
5. Applies tier modulation: `[demo]`-tagged matches at demo tier → severity `advisory`; otherwise → severity `block`.
6. Hands the structured findings array to the audit agent prompt alongside the rendered §H, the active tier, and the allowlist. Agent produces the audit report and the PASS/FAIL marker.

**Why this over agent-runs-grep**: Determinism. "Did you commit a real `sk_live_*` key" is not a question for fuzzy LLM judgment. Native regex/grep gives identical results on every audit run. Agent-runs-grep also burns SDK tokens on operations that cost ~0¢ as native code.

**Allowlist mechanics — two levels**:

- **Per-match allowlists** (catastrophic and high-value rules) carry `rule` + `reason` + `expires`. Match a finding's exact ruleId; surface the specific match.
- **Pattern-level allowlists** (advisory rules only — H.4.2-class regex-noisy rules) carry `pattern` (glob) + `rule` + `reason` + `expires`. Suppress findings whose `file` matches the glob.

Pattern-level allowlists are explicitly DISALLOWED for `[always-block]` rules and `[startup]`-tier rules. This prevents the "allowlist all of `src/`" anti-pattern.

**Allowlist expiry**:
- Active (current date < `expires`): findings → `allowlisted`, do not block.
- Expiring soon (within 14 days of `expires`): show in audit report under "Allowlists expiring within 14 days."
- Expired (current date > `expires`): allowlist ignored; findings revert to normal severity. Audit report calls these out as `EXPIRED ALLOWLIST` with the rule ID and reason. Mycelium does not auto-delete expired entries.

**Report shape**:

The existing audit-report markdown gains a section "8. Security findings" between sections 4 and 5:

```markdown
## 8. Security findings (tier: startup)

Active allowlists: H.1.4 (expires 2026-09-01), H.4.2 [pattern: __tests__/**] (expires 2027-01-01)

### Blocking violations (3)
- H.1.1 [always-block]: src/lib/stripe.ts:14 contains `sk_live_xxxxx`
- H.3.1 [always-block]: supabase/migrations/003_jobs.sql line 12 — table `jobs` has no ENABLE ROW LEVEL SECURITY
- H.2.2 [demo, expo-supabase]: src/contexts/AuthContext.tsx:67 stores token via raw AsyncStorage; use secureStorageAdapter

### Advisories (1)
- H.4.2 [demo]: src/screens/auth/SignInScreen.tsx:88 — console.log includes `email` identifier

### Allowlisted (1)
- H.1.4: secret manager not yet adopted (expires 2026-09-01)

### Expired allowlists (0)
```

**Exit code**: non-zero if any blocking finding survived filtering. `mycelium contracts freeze` shells out to audit and refuses on non-zero exit (existing behavior, extended).

### 3.5 Lifecycle & promotion

Three real-world scenarios:

**A. Born-demo, stays demo** (e.g., LiveGrid Track 1 — investor demo)
`mycelium plant brief.md --stack expo-supabase --security demo`. Always-block rules enforced; foundational-4 rules advisory. Cultivation produces working app with security findings printed but freeze succeeds. Never promoted; production lives on a separate organism cultivated at startup tier from scratch.

**B. Born-startup** (e.g., Bardot Track 1 — production launch)
`mycelium plant brief.md --stack expo-supabase --security startup`. All foundational-4 rules block. The planner generates §H with full strictness; leaves see those rules in their consumed NUTRIENTS and produce code that respects them from the first commit.

**C. In-place promotion: demo → startup**
Operator runs `mycelium contracts upgrade-tier startup` against an existing organism. Updates yaml, re-renders §H, leaves the rest of NUTRIENTS untouched. Existing leaf code stays on disk. Subsequent `mycelium contracts audit` surfaces every leaf-level violation now active at the new tier. Operator either fixes source or allowlists with reason+expiry.

**Re-cultivation is NOT triggered by tier promotion.** Existing files persist; closing security gaps is normal source-edit work.

### 3.6 Testing & validation

**Three test layers**:

1. **Unit tests per scanner** (`cli/src/security/scanners.test.ts`)
   Each scanner has a fixtures directory: `cli/src/security/fixtures/H.1.1/{good,bad}/`. Tests assert:
   - `bad/` fixtures produce findings (true positives)
   - `good/` fixtures produce zero findings (true negatives)
   - Fixtures matching §F.7 placeholder patterns produce zero H.1.1 findings (exemption works)

2. **Tier modulation tests** (`cli/src/commands/contracts.audit.test.ts`)
   Synthetic NUTRIENTS + synthetic findings + tier flag → verify which findings block vs warn vs pass. ~12 cases for v1's 9 scanners across 3 tiers.

3. **End-to-end against live cultivation** — see "run-4 validation plan" below.

**Build-time consistency check**: `npm run build` runs the registry assertion (every rule ID has a scanner; every scanner has a rule ID).

**Run-4 validation plan**:

The first cultivation against this design gets observed for measurement, not asserted. Run-4 plan:

1. **Plant at demo tier**: `mycelium plant brief.md --stack expo-supabase --security demo`. Audit should show all `[always-block]` rules pass (no real keys committed) and tier-modulated rules report findings as advisories. The §F.7 placeholder Supabase URLs should NOT trigger H.1.1.
2. **Plant a fresh organism at startup tier**: same brief, fresh dir, `--security startup`. Audit measures: how many findings, what categories, false-positive rate per scanner.
3. **In-place upgrade test**: take the demo cultivation from step 1, run `mycelium contracts upgrade-tier startup`, re-audit. Same findings should now block where they previously warned.
4. **Allowlist test**: add `H.1.4` to `security_allowlist` with future expiry. Audit shows allowlisted. Edit expiry to past date. Audit shows `EXPIRED ALLOWLIST` and the underlying finding blocks freeze.

**False-positive management**:
- Allowlist as exit valve. Friction is intentional — forces operators to look at each one.
- Scanner versioning: each scanner's regex carries a version (e.g., `H.1.1.v1`). Recurring false positives observed in real cultivations trigger a refinement (e.g., `H.1.1.v2` excludes `__tests__/`). Version bump invalidates prior allowlists for that rule, forcing re-review.

**Iterative refinement loop**:
Section H is empirical. Every cultivation surfaces signal:
- Real findings the rules caught (validates the rule)
- False positives (signal to refine the scanner)
- Real attack-surface gaps the rules MISSED (signal to add a rule)

Expectation: run-4 surfaces 1–3 new rule candidates and 2–5 false positives per scanner. Same loop that took run-1's 24 contract-drift errors to run-3's 1.

## 4. Implementation scope notes

**Estimated LOC**: ~1250 net-new lines across the framework, dominated by the rule-body content in stack appendices (~400 lines combined) and the scanner module (~400 lines).

| Area | Component | LOC estimate |
|---|---|---|
| Data model | `ContractAppendix.securityRules` + `mycelium.yaml` schema | ~30 |
| Stack appendix | expo-supabase `securityRules` content (~20 rule bodies) | ~250 |
| Stack appendix | nextjs-fastapi-supabase `securityRules` content (initial baseline) | ~150 |
| Scanners | 9 scanner functions + registry + tests | ~400 |
| CLI | `--security` flag on plant; `upgrade-tier` subcommand | ~80 |
| Audit integration | findings collection, allowlist filter, tier modulation, prompt extension | ~150 |
| Tests | Unit + tier modulation tests | ~200 |
| Total | | **~1260** |

**Milestone split** (suggestion for writing-plans):

1. **M1 — Data model + content** (one PR-shaped change)
   - Add `securityRules` to `ContractAppendix` interface
   - Draft full ~20 rule bodies in `appendix.expo-supabase.ts` (the spec shows 3 fully — the other 17 follow the same Rule/Audit/Violation rigor)
   - Initial `securityRules` baseline in `appendix.nextjs-fastapi-supabase.ts`
   - `--security` flag on plant; record in mycelium.yaml
   - Build passes; existing audit passes (no Section H enforcement yet)

2. **M2 — Scanners + audit integration**
   - `cli/src/security/scanners.ts` with 9 scanner functions
   - Registry + build-time consistency check
   - Audit subcommand integrates findings collection, allowlist filter, tier modulation
   - Audit prompt updated with "Security findings" section
   - Run-4 first measurement

3. **M3 — Lifecycle**
   - `upgrade-tier` subcommand
   - Downgrade detection (git log walk for prior `security_tier` values)
   - `SECURITY-DOWNGRADE.md` enforcement
   - Allowlist expiry warnings + EXPIRED ALLOWLIST report markers

4. **M4 — Hardening from run-4 observations** (anticipated)
   - Scanner refinements based on false positives observed
   - New rules surfaced from real attack-surface gaps
   - Fixture suite extension

Each milestone is independently shippable and observable.

## 5. Open questions

None at design time. Two items the implementation phase will need to settle:

- **Adapter snippet location**: the `secureStorageAdapter` snippet lives in §F.7 / §H.2.2 examples. M1 needs to decide whether the snippet is canonical text leaves copy verbatim, or whether app-shell biome's HYPHA Outputs claim `src/lib/secureStorage.ts` as a deliverable that other biomes import. Recommended: latter — keeps the contract surface honest.
- **Scanner false-positive baseline**: M2 should record the false-positive rate per scanner against the LiveGrid run-3 codebase (already on disk, known patterns) before deploying to run-4. If H.4.2 produces 50+ false positives on existing code, the regex needs refinement before run-4, not after.

## 6. Cross-references

- `cli/src/stacks/index.ts` — `ContractAppendix` interface
- `cli/src/stacks/appendix.expo-supabase.ts` — rule body content for v1
- `cli/src/commands/plant.ts` — `--security` flag wiring + planner prompt extension
- `cli/src/commands/contracts.ts` — audit subcommand findings integration; new `upgrade-tier` subcommand
- Run-1 / run-3 outcome data (in framework HANDOFF) — empirical motivation for which rules were chosen
