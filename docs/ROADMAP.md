# Mycelium — Docs Roadmap & Build Order

> **Status:** Living index · 2026-05-29 · reconciled against `cli/src/` + git history
> **Purpose:** Single source of truth for what every `docs/*.md` file *is*, what's
> actually built vs. planned, and the dependency-locked order future work must follow.

This index exists because "future work in `docs/`" is only partly accurate. Three
docs describe *shipped* features (reference docs now), two are *vision* whitepapers,
and the genuinely-unbuilt build plans carry a **one-way dependency order** in their
own text — they cannot be sequenced by preference.

Each entry was verified against the codebase, not taken on faith from the doc header.

---

## Legend

| Bucket | Meaning |
|---|---|
| 🟢 **SHIPPED** | Feature is live in `cli/src/`. The doc is now a reference / design-of-record. |
| 🔵 **VISION** | Positioning / strategy whitepaper. Sets direction; not a build plan. |
| 🟡 **BUILD-READY** | Code-grounded plan, verified unbuilt. In the active work queue. |
| 🟠 **DESIGN-NOTE** | Has open questions; unbuilt or partially built. Needs a freeze before building. |
| ⚪ **SCOPING** | Decision-gated. Do **not** build until the gate clears. |

---

## 🟢 Bucket A — Shipped (reference docs, NOT future work)

| Doc | Code reality | Notes |
|---|---|---|
| `mycelium-audit-run-spec.md` | `cli/src/commands/audit-run.ts` + `cli/src/lib/audit/` (18 files). Merged PR #2 (`81f6485`). | Design-of-record for the audit/heal-loop layer. |
| `audit-run-tester-authoring.md` | Operator runbook; the `HYPHA-TEST-*` scaffold + loader it documents are live. | Live reference. |
| `dashboard-theming.md` | `theme.yaml` + `cli/src/lib/dashboard/theme.ts`. Shipped PR #3. | Live reference. |

**Do not re-plan these.** They are documentation for working features.

---

## 🔵 Bucket B — Vision / positioning whitepapers

| Doc | What it is |
|---|---|
| `mycelium-bus-product-architecture-whitepaper.md` (2026-05-29) | **Strategic North Star.** Maui + Mycelium + the ~789-capability fleet as a *product* over one message bus: triage → 3 tiers → contract-bound agents → promotion gate. Ends explicitly: "design artifact, not an implementation plan." |
| `mycelium-design-system-whitepaper.md` | **Brand / patent framing.** The biology-not-industry vocabulary argument. Pairs with `MANIFESTO.md`. |

These set direction; they are not ranked against build specs.

---

## 🟡 Bucket C — Build-ready, verified unbuilt (the active queue)

| Doc | Verified unbuilt | Runway | Order |
|---|---|---|---|
| `contract-tests-from-nutrients.md` | No `cli/src/lib/contracts/` (only `commands/contracts.ts` = the freeze cmd). | ~3.5d | **P0** |
| `mycelium-eval-spec.md` | No `cli/src/lib/eval/`, no `evals/`, no `eval.ts`. | ~6d | **P1** |
| `mycelium-router-30day-plan.md` | No `cli/src/lib/router/`. Chokepoint `cultivate.ts:480` still Anthropic-only (now cache-wrapped). | ~30d | **P2** |

---

## 🟠 Bucket D — Design notes with open questions

| Doc | Verified state | Disposition |
|---|---|---|
| `cache-network-micro-agents.md` | **Half-built.** `cli/src/lib/cache-network/` (~820 LOC) **is wired into cultivate** with a pulse timer. But `cli/src/lib/micro-agents/` (~286 LOC) ships **deterministic state objects only — no real LLM fan-out.** | **P3** — make micros real on the existing cache. See "Headline enhancement" below. |
| `temporal-context-framework.md` (TCF v0.2) | No `TRS`/`decay_profile`/`hlc` in code. Router + cache docs both say "ship without TCF." | Parallel / deferrable. v0.3 freeze gated on promoting §B/§C. Freeze before any operator-HYPHA code. |
| `bus-router-livegrid-architecture-pack.md` | Vision pack (Cee-Ro). The 30-day router plan is its honest first step. | Keep as destination map; router plan is the actionable slice. |

---

## ⚪ Bucket E — Scoping, decision-gated (do NOT build)

| Doc | Gate |
|---|---|
| `hooks-via-agent-sdk-scoping.md` | Requires a 4-step SDK investigation (read `.d.ts`, prototype one hook, classify EASY/MEDIUM/HARD) before any code. Core unknown: does `@anthropic-ai/claude-agent-sdk` expose a *blocking* `canUseTool`-style callback? 1-day spike, then decide. |

---

## The dependency-locked build order

Sourced from the specs' own text, not preference. The constraints are one-way:

- `eval-spec` is emphatic: ships **before** Router phase 1, or the reliability
  baseline (and the ability to attribute regressions) is lost forever.
- `contract-tests` provides eval's `contract` judge type → contracts ≤ eval.
- `cache-network` §9: "Router phase 1 lands first."
- TCF: both router and cache say build without it → parallel/deferrable.
- hooks: gated behind a cheap investigation, not a build.

```
P0  Contract-tests-from-NUTRIENTS   (~3.5d)  cheapest, highest run8-leverage; unblocks eval
        │  (provides the `contract` judge)
        ▼
P1  Eval harness (pass@k)           (~6d)    MUST precede router or baseline is lost
        │  (locks the reliability baseline)
        ▼
P2  Router phase 1                  (~30d)   the chokepoint change eval protects
        │  (stabilizes routing_decision shape)
        ▼
P3  Make micros REAL + finish cache (~1–2wk) realizes the documented cost thesis

  ∥  TCF v0.3            — parallel; freeze before any operator-HYPHA code
  ⚑  Hooks investigation — 1-day spike, gate-then-decide
```

> **Note (2026-05-29):** SPY elected to move on **P3 (real micro-agents)** next,
> ahead of P0–P2. This is a deliberate out-of-order pick: micros realize the
> already-shipped cache's cost story and are the biggest gap between the product's
> narrative and its reality. P3 does **not** strictly depend on P0–P2 (the cache
> is built; the chokepoint exists), but it lands without a pass@k baseline — so a
> reliability check on micro fan-out will need to be improvised until P1 exists.

---

## Headline enhancement — make micro-agents real

`cache-network-micro-agents.md` sells the entire cost thesis: leaves fan out into
2–4 cheap/full micros, the cache absorbs the read-path, "less DB development."
**PR #3 shipped only the visual shell.** `cli/src/lib/micro-agents/spawn.ts`
produces deterministic xorshift-seeded *state objects* for the dashboard — it never
calls `query()` or any LLM. The cache (`store.ts`, `accounting.ts`) **is** real and
wired at `cultivate.ts:480`.

The top-tier move is therefore **not "build a cache"** — it's **"make micros spawn
real LLM sub-sessions that ride the cache that already exists."** That converts the
cheap/full split from a colored sphere on the dashboard into a real cost reduction.

---

## Synthesis — hardening IS the product prerequisite

The bus-product whitepaper's safety model (§3.5) is that cultivation runs
**headless and auto-triggered**, made safe *only* by the spend-gate + promotion-gate.
Those gates are trustworthy only if cultivation reliability is **measurable** — which
is exactly what contracts (P0) + eval (P1) deliver. The reliability tooling in
Bucket C is not a separate track from the product vision; **it is its load-bearing
prerequisite.** You cannot let a stranger's message auto-trigger a paid cultivation
until you can prove cultivations reliably do what their contracts say.

---

## Open framework bugs (from HANDOFF 2026-05-16, re-verified 2026-05-29)

| # | Bug | Status |
|---|---|---|
| 1 | Harvest threshold mismatch (`feat/<biome>` vs `feat/<leaf>`) | ✅ **Closed** by `310ea12` (harvest rollup to biome level). |
| 2 | `dashboard.canvas.multiverse` artifact-path mismatch (files produced, declared path absent) | 🔴 Open. Shares root cause with #3. |
| 3 | Four `dashboard.cli.*` leaves "0 files committed" though files exist | 🔴 Open. `git add --all -- <declared-paths>` couldn't match actual write paths. |
| 4 | `mycelium contracts freeze` requires `--stack`; framework-internal cultivations have none | 🔴 Open. Fix: add a `stack: framework-internal` preset (`--skip-audit` is the current workaround). |

Bugs #2 + #3 share a root cause (declared-artifact-path vs. actual-write-path) — one focused fix.
