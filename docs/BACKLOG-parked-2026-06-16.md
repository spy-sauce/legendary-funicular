# Mycelium — Parked Execution Backlog

> **Status:** PARKED for execution time (authored 2026-06-16, senior-lead deep-dive session).
> **Decision context:** Bus-product (PR #4) is **NOT the next priority** — it will be integrated later as a **research track**, not the immediate build. This backlog consolidates and instruments the *engine* first.
> **Organizing principle:** Stop opening new fronts. Stabilize + instrument the engine before building product on it. This is a *consolidation* backlog with the product gated behind it — the value is in the **dependency edges and refusal gates**, not the item count.

## Status addendum — 2026-07-02

> Dated artifact — items below are NOT rewritten; this block records execution status only.

- **0.1 SHIPPED** — worktree isolation per leaf landed as `22351c3` on this branch (`feat/engine-tier0-worktree-iso`).
- **0.3 fixed this session** — harvest biome→leaf rollup; mirrors PR #3's `310ea12`, so the change dedups at merge.
- **0.2 built this session** — `mycelium eval` implemented (phases 1–3 of `docs/mycelium-eval-spec.md`).
- **1.2 in motion** — audit-run bugs 2/3/5 fixed this session; the consolidated tracker now lives at **`docs/BUGS.md`** (open/fixed/pending-validation/closed, with newly-found engine + heal-loop bugs).
- **The `:480` anchor is STALE** — post-`22351c3`, the Claude Agent SDK `query()` call sits at `cultivate.ts:598`, inside `cultivateLeaf`. **Re-anchor refusal gate #1 to the symbol** (the `query()` call in `cultivateLeaf`), not the line number.

---

## The one structural fact that drives ordering

`cli/src/commands/cultivate.ts:480` (the Claude Agent SDK spawn chokepoint) is the **most contended line in the repo**:
- cache-network (PR #3, open) wraps it,
- the Router 30-day plan targets it,
- leaves spawn there today.

Whoever touches it first sets the regression baseline. **The eval baseline must exist *before* anyone modifies `:480`**, or regression attribution (router vs. model-drift vs. prompt-drift vs. cache) is permanently lost. This is stated as a hard constraint in `docs/mycelium-eval-spec.md`.

---

## 🔴 Tier 0 — Foundation (refuse to build product until these land)

| # | Item | Why P0 | Effort | Anchors |
|---|------|--------|--------|---------|
| **0.1** | **Worktree isolation per leaf** — replace shared-working-tree `git add <artifacts>` with `git worktree`-per-leaf | Commit-attribution race is a **silent correctness bug** (last-writer-wins on overlapping paths); surfaced **3×**, only band-aided. Repo's own comment names worktrees as the deferred "real" fix. | M | `cultivate.ts:841-936` (band-aid + comment at `:850`) |
| **0.2** | **Eval baseline** — build `mycelium eval` per existing spec (Lane A/B/C, pass@k, worktree-per-trial) | The **gate for `:480`**. Spec says it must land *before* Router phase 1 or regression attribution is lost forever. Closes the "zero formal reliability data today" deficit. | L (~6d) | `docs/mycelium-eval-spec.md` |
| **0.3** | **Harvest ID-namespace fix** — harvest matches `agent.id` (biome) against a `state.json` keyed by **leaf id**; roll leaf statuses up to biome | **Independent of 0.1** (verified — read path, not write path). Causes false "0% harvest" on cellular cultivations where work fully shipped. | S | `harvest.ts:115` vs. `cultivate.ts` leaf-keyed seed |

**0.1 + 0.2 are independent surfaces — ship 0.1 now, run 0.2 in parallel. 0.3 is a quick win.**

---

## 🟠 Tier 1 — Resolve divergent branches before stacking more

| # | Item | Why |
|---|------|-----|
| **1.1** | **Decide PR #3's fate (merge behind eval, or explicitly park)** | ~11k lines, open since 2026-05-16, forks from same base as PR #4. Two long-lived divergent branches off one `main` = red flag. PR #3's cache-network *also* wraps `:480` — cannot land after product depends on a different baseline. |
| **1.2** | **Consolidate 7 open framework bugs into one tracker** + close PR#2 bugs 2/3/5 (each a located single-file fix) | No single bug list exists; scattered across two HANDOFFs. Bug 3 (SHA dedupe includes LLM `summary`) needs NUTRIENTS §1 amendment — drop `summary` from id hash. |

---

## 🟡 Tier 2 — De-risk the product's load-bearing assumptions (research, not build) — runs alongside bus-product research track

| # | Item | Why it's the silent killer |
|---|------|----------------------------|
| **2.1** | **Spike + measure §6.7 intent→capability resolution** | Whitepaper flags this as load-bearing and cites its own numbers: **~50% capabilities undiscovered** when cap-reg skipped, **+1.4pp** from keyword enrichment. Where AI-agent products die in production. Cheap to learn, catastrophic to assume. |
| **2.2** | **Design §6.8 harm-vs-cost gate** | Spend-gate makes headless invocation *cost*-safe, not *harm*-safe. Gates the autonomy story: what a leaf may *do* (write where? send to whom?), not just spend. |

---

## 🟢 Tier 3 — Bus-product build (RESEARCH TRACK, deferred per operator decision 2026-06-16)

Build as a **new repo depending on a now-stable, *versioned* framework** (the "product = new repo" decision reinforces Tier 0 — a dependency can't sit on an unstable base). First build = **iMessage → triage → single-capability happy path** against the existing fleet; bus retrofitted later (forward-compatible design makes this viable). The 3 interface contracts (§6.1 failure / §6.3 async / §6.4 statefulness) are already resolved.

---

## Refusal gates (explicit)

1. **No touching `cultivate.ts:480`** (router/cache) **until the eval baseline (0.2) exists.**
2. **No product code depending on the engine until worktree isolation (0.1) lands.**
3. **No auto-triggered headless cultivation until the §6.8 harm gate (2.2) is designed.**

---

## Hygiene batch (½ day, grouped — NOT backlog headlines)

- Stale root `CELLULAR-MAP.md` — still describes old `ddp-integration` organism; regenerate via `mycelium map` (current scope = `audit-run`).
- `CLAUDE.md` rule #5 test carve-out — security (`cli/src/security/*.test.ts`) + micro-agent suites are legit exceptions; the rule's "this repo intentionally has none" is now false (5 test files, 31 passing, CI runs them).
- Reconcile the two HANDOFFs (root + `feat/dashboard-cache-net`).
- Doc the `ci.yml` (4-stage framework PR gate) vs. 8-stage DDP (cultivated-app pipeline) distinction so it stops reading as a contradiction.

---

*Every item either unblocks another or gates a risk. If it does neither, it's hygiene (last batch). Bottleneck is not ideas — it's validated, consolidated engine code.*
