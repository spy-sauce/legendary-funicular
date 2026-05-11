# Authoring Audit Testers — Operator Runbook

How to write `HYPHA-TEST-*.md` files for your cultivation's audit surface.

---

## 1. Two paths in

### 1.1 Scaffold (recommended)

```bash
mycelium audit-run scaffold-tester <biome-id>
```

This emits a stub file at `hyphae/HYPHA-TEST-<biome-id>.md` pre-filled from the biome's HYPHA scope. Edit the Assertions, Repro recipe, and Suggested fix sections — the scaffold gives you the skeleton.

### 1.2 Hand-author

Create the file directly following the schema in [NUTRIENTS.md §6](../NUTRIENTS.md#6-hypha-test-md-authoring-schema). Use this when your tester doesn't mirror a single biome (cross-cutting testers like `tester.types` or `tester.security`).

---

## 2. CACHE HEADER fields

Every `HYPHA-TEST-*.md` starts with a `## CACHE HEADER` block. The audit-testers loader parses these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `TESTER_ID` | **yes** | Must start with `tester.` — e.g., `tester.flow.talent` |
| `MIRRORS_BIOME` | **yes** | Biome this tester validates, or `(cross-cutting)` |
| `SCOPE` | **yes** | One-line description of what this tester covers |
| `INPUTS` | **yes** | Comma-list of paths (cultivated artifacts + NUTRIENTS sections) |
| `TOOLS` | no | Defaults to `Read, Bash`. Write/Edit are stripped if declared |

**Example — mirror-biome tester:**

```markdown
## CACHE HEADER
- **TESTER_ID:** tester.flow.talent
- **MIRRORS_BIOME:** talent-onboarding
- **SCOPE:** Verify 8-step wizard persists all fields to talent_profiles
- **INPUTS:** src/screens/onboarding/talent/, NUTRIENTS.md#talent-onboarding, supabase/migrations/
- **TOOLS:** Read, Bash
```

**Example — cross-cutting tester:**

```markdown
## CACHE HEADER
- **TESTER_ID:** tester.types
- **MIRRORS_BIOME:** (cross-cutting)
- **SCOPE:** TypeScript compilation succeeds with no any-leaks
- **INPUTS:** src/, tsconfig.json
- **TOOLS:** Read, Bash
```

---

## 3. Writing assertions

The `## Assertions` section describes what the tester checks. Assertions must be **deterministic** — they produce the same result on repeated runs with the same inputs.

### 3.1 Exit-code assertion

Runs a command and asserts exit code 0.

```markdown
## Assertions

1. `tsc --noEmit` exits 0 (no type errors)
2. `grep -rE '\bany\b' src/ --include='*.ts' --include='*.tsx'` exits 1 (no matches)
```

**When to use:** Compilation, linting, static analysis, format checks.

### 3.2 File-presence assertion

Asserts that a specific file exists and optionally matches a pattern.

```markdown
## Assertions

1. `src/providers/TalentOnboardingProvider.tsx` exists
2. `src/providers/TalentOnboardingProvider.tsx` exports a `TalentOnboardingContext`
3. `src/screens/onboarding/talent/TalentNameScreen.tsx` imports from `TalentOnboardingProvider`
```

**When to use:** Verifying cultivated code follows the specified architecture.

### 3.3 DB row assertion

Queries the database and asserts row state.

```markdown
## Assertions

Run the onboarding wizard with synthetic input, then:

1. `psql $DATABASE_URL -c "SELECT COUNT(*) FROM talent_profiles WHERE user_id = '$TEST_USER_ID';"` returns 1
2. `psql $DATABASE_URL -c "SELECT display_name, bio, category FROM talent_profiles WHERE user_id = '$TEST_USER_ID';"` returns non-NULL values for all columns
```

**When to use:** Verifying flows that persist data — onboarding, booking, messaging.

### 3.4 Maestro flow assertion

Runs an end-to-end test via Maestro and asserts success.

```markdown
## Assertions

1. `maestro test e2e/talent-onboarding-full.yaml` exits 0
2. Post-run DB check (see §3.3) confirms row persisted
```

**When to use:** Full user-flow validation in React Native apps. Per spec §10.3, Maestro is the v1 lean for flow testers.

---

## 4. Repro recipe

The `## Repro recipe` section lists ordered commands the tester runs. These same commands flow into `finding.repro_steps` when an assertion fails.

```markdown
## Repro recipe

1. `cd $CULTIVATION_DIR`
2. `npm install`
3. `npx expo start --no-dev --minify &`
4. `sleep 10`
5. `maestro test e2e/talent-onboarding-full.yaml`
6. `psql $DATABASE_URL -c "SELECT * FROM talent_profiles ORDER BY created_at DESC LIMIT 1;"`
```

**Guidelines:**

- Commands must be copy-paste runnable (no placeholders without env-var semantics)
- Include setup steps (install, build, start)
- Include the assertion commands that failed
- Order matters — the re-plant operator runs them in sequence

---

## 5. Suggested fix template

The `## Suggested fix template` section gives the re-plant leaf an acceptance criterion. When an assertion fails, the tester copies this text into `finding.suggested_fix`.

```markdown
## Suggested fix template

Lift onboarding state to a Context Provider (`TalentOnboardingProvider`).
Wrap the onboarding stack in `RootNavigator`.
Each step screen reads/writes via `useTalentOnboarding()` instead of local `useState`.
`saveTalentProfile()` reads from the context, not initial state.
```

**Guidelines:**

- Describe the solution, not the problem (the problem is in the finding's `detail` field)
- Be specific enough that the leaf knows what to change
- Reference file paths when helpful
- If the fix is unclear, write "Investigate root cause; the DB row should not be empty after wizard completion"

---

## 6. Tool budget

Testers operate with a **read-only tool budget**:

| Tool | Granted | Notes |
|------|---------|-------|
| `Read` | **yes** | Read any file in the cultivation |
| `Bash` | **yes** | Run commands (psql, grep, tsc, maestro, etc.) |
| `Write` | **no** | Testers observe, they don't fix |
| `Edit` | **no** | Same — fixes happen in the re-plant cycle |

### Why no Write/Edit?

Audit testers are **symmetric observers** — they exist to detect defects, not to fix them. Fixing happens during the `--autofix` re-plant cycle, where the affected biome leaves get Write/Edit tools and the finding's `suggested_fix` becomes an acceptance criterion.

If a `HYPHA-TEST-*.md` declares Write or Edit in its TOOLS field, the loader logs a warning and strips them:

```
WARN: tester.flow.talent declares Write — stripped (testers are read-only)
```

---

## 7. Common patterns

### 7.1 Mirror-biome testers

One tester per biome. The tester's `MIRRORS_BIOME` field matches the biome id. Assertions focus on that biome's deliverables.

**Example:** `tester.flow.talent` mirrors `talent-onboarding`.

### 7.2 Cross-cutting testers

Testers that span multiple biomes. `MIRRORS_BIOME` is `(cross-cutting)`.

**Examples:**

| Tester | What it checks |
|--------|----------------|
| `tester.types` | TypeScript compilation, no `any` leaks |
| `tester.security` | NUTRIENTS §H audit grep set (no secrets, no hardcoded keys) |
| `tester.tokens` | Design token usage — no hardcoded hex, primitives match NUTRIENTS |

### 7.3 Contract-delegating testers

`tester.contract` delegates to the contract generators in `cli/src/lib/contracts/generators/`. It does not reimplement contract validation — it invokes the same code harvest's `--contract-threshold` uses.

**Note:** Per spec §7 sequencing, `tester.contract` stubs to a no-op until `contract-tests-from-nutrients` ships. Once generators exist, `tester.contract` becomes the audit-run safety net for contract surface coverage.

---

## 8. Complete example

A full `HYPHA-TEST-*.md` file for the canonical run8 talent-onboarding case:

```markdown
# HYPHA-TEST — tester.flow.talent

## CACHE HEADER
- **TESTER_ID:** tester.flow.talent
- **MIRRORS_BIOME:** talent-onboarding
- **SCOPE:** Verify 8-step wizard persists all fields to talent_profiles
- **INPUTS:** src/screens/onboarding/talent/, NUTRIENTS.md#talent-onboarding, supabase/migrations/
- **TOOLS:** Read, Bash

## Assertions

1. `maestro test e2e/talent-onboarding-full.yaml` exits 0
2. Post-run: `psql $DATABASE_URL -c "SELECT display_name, bio, category, genres FROM talent_profiles WHERE user_id = '$TEST_USER_ID';"` returns non-NULL for all columns
3. Context provider exists: `src/providers/TalentOnboardingProvider.tsx` is present
4. Step screens import context: `grep -l 'useTalentOnboarding' src/screens/onboarding/talent/*.tsx` returns at least 8 files

## Repro recipe

1. `cd $CULTIVATION_DIR`
2. `npm install`
3. `supabase start` (or connect to Supabase branch)
4. `npx expo start --no-dev --minify &`
5. `sleep 15`
6. `maestro test e2e/talent-onboarding-full.yaml`
7. `psql $DATABASE_URL -c "SELECT * FROM talent_profiles ORDER BY created_at DESC LIMIT 1;"`

## Suggested fix template

Lift onboarding state to a Context Provider (`TalentOnboardingProvider`).
Wrap the onboarding stack in `RootNavigator`.
Each step screen reads/writes via `useTalentOnboarding()` instead of local `useState`.
`saveTalentProfile()` reads from the context, not initial state.
```

---

## References

- [NUTRIENTS.md §6](../NUTRIENTS.md#6-hypha-test-md-authoring-schema) — Frozen HYPHA-TEST schema
- [NUTRIENTS.md §4](../NUTRIENTS.md#4-tester-registry-runner-contract) — Loader and runner contracts
- [NUTRIENTS.md §1](../NUTRIENTS.md#1-finding-schema) — Finding schema (what testers emit)
- [docs/mycelium-audit-run-spec.md](./mycelium-audit-run-spec.md) — Full audit-run design spec

---

*The network provides.* 🍄
