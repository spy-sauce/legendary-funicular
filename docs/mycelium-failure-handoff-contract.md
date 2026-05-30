# Failure Handoff Contract

> **Status:** Design sub-doc · v1 · 2026-05-29
> **Author:** SPY (Sean Young) + Cosmo
> **Scope:** The contract by which capability-level failures hand off to the bus and orchestration layers. Resolves §6.1 of the [bus-mediated architecture white paper](./mycelium-bus-product-architecture-whitepaper.md) — the failure/timeout seam flagged as blocking any real deployment.
> **Explicitly out of scope (deferred):** fallback-biome *selection* (depends on §6.7 cap-reg resolution) and partial-result *composition policy* (depends on §6.2 Tier-2 mechanics). This doc designs the **interface**; the **policy** that consumes it is a clean follow-on once those seams are resolved.

---

## 1. The problem

The architecture composes capabilities over a bus. Capabilities fail — they go down, they hang, they return garbage. The white paper (§6.1) flagged that the *bus* needs its own failure story, because the existing fleet-internal fallback chains only cover one of three levels where a failure can be caught.

The trap this contract exists to avoid is a **race**: a capability that is still working internally vs. one that has given up are indistinguishable to an outside observer watching a clock. If the bus can't tell "gave up early" from "still going, just slow" from "hung," it either kills useful work or hangs forever. The deliverable here is the contract that makes those states unambiguous.

## 2. Three levels of failure handling

Failure is caught at three levels, mapped to *who has the knowledge to handle it*. The key principle: **each level handles only what it alone can know.**

| Level | Owner | Handles | Why there |
|---|---|---|---|
| **1. Domain fallback** | Inside the capability | "Brave rate-limited → use Playwright → Puppeteer → 2Captcha" | Only the capability knows its domain-specific fallback chain. **Unchanged by this contract — it already works.** |
| **2. Transport** | Bus / transport adapter | Capability unreachable, hung past deadline, malformed nutrient | Only the bus sees the wire. The capability can't report a failure it never received a request for. |
| **3. Semantic + cross-capability** | Orchestrator (triage / Tier-2 agent / cultivation) | "Result is useless → try a different source"; "1 of 3 parallel leaves failed → compose partial or fail whole?" | Only the orchestrator knows the *intent*, so only it can judge result quality or whether a fallback even makes sense. **Policy deferred (§6.2/§6.7); this doc defines what level 3 receives.** |

This contract is about the **handoffs between these levels** — specifically, the structured signal that travels up from levels 1/2 to level 3.

## 3. Timeout clock ownership

**Decision: the bus enforces the deadline; the capability self-budgets within it.**

The request envelope already carries a `deadline` field (see white paper §3.3). The contract centers on it:

- The capability is **told** the deadline and self-budgets its internal retries (level 1) to finish before it. If it exhausts its domain chain *before* the deadline, it emits a structured `exhausted` error nutrient and stops.
- The bus enforces the `deadline` as a **hard outer bound**. If the deadline passes with no result and no error nutrient, the bus kills the call and emits a `deadline_hit` error nutrient itself.

This is two clocks, but the bus's is authoritative, which resolves the race: **whichever fires first is unambiguous.**

- Capability emits `exhausted` first → it gave up of its own accord; a *different* capability-biome might succeed.
- Bus fires `deadline_hit` first → the capability was killed mid-flight; retrying it *the same way* won't help (it was making progress or hung, but either way the same call under the same deadline is futile).

Rejected alternatives:
- *Capability owns the clock entirely* — a hung or crashed capability never reports, and the request hangs forever. No backstop.
- *Bus owns the clock entirely* — the capability can't self-budget, so every failure looks like a hard kill. Loses the `exhausted` vs `deadline_hit` distinction, which is the entire point of the contract.

## 4. Failure taxonomy

The error nutrient carries a `failure_class` from a **closed set of five**. Downstream consumers branch on this, so it is a small, meaningful enum — never freeform text (that's what `detail` is for). Each class maps to a distinct recovery posture.

| `failure_class` | Meaning | Recovery posture (for level 3, when designed) |
|---|---|---|
| `exhausted` | Capability tried its domain chain and gave up **before** the deadline. | A *different* capability-biome might help. Candidate for fallback. |
| `deadline_hit` | Bus killed the call at the hard deadline; no result returned in time. | Retrying *the same way* won't help. Escalate deadline, pick a faster path, or surface. |
| `unreachable` | Capability never received the request — process down, connection refused, no route. | Transport-level. Capability is offline; fallback biome or surface. Distinct from `exhausted` (which means it *ran*). |
| `bad_request` | The request nutrient was malformed / failed the capability's interface descriptor (wrong schema, missing field). | **Caller's fault — do not retry.** Surface as an internal error; this is a bug, not a transient failure. |
| `degraded` | Capability returned, but **flags its own result as low-confidence or partial**. | Carries the partial result (§5). Orchestrator chooses: use it, or treat as soft failure and seek better. |

**On `degraded` — failure or result?** It is deliberately *both*. A `degraded` nutrient carries the actual partial/low-confidence result in `partial_result` (§5) *alongside* the failure marker. This avoids forcing a binary: the orchestrator can use the partial output, or treat it as a soft failure and seek a better source, without the capability having to guess which the caller wants. `degraded` is the only failure class that is also a (partial) success.

## 5. The error nutrient schema

This is the load-bearing artifact. It is consumed not just by failure recovery but by **observability/dashboard** (retry depth, failure rates per capability), the **budget ledger** (spend-on-failure attribution), and the **trace** (one coherent story per request). Getting it right once pays across the whole architecture. Its trace/cost fields deliberately mirror the request envelope so the ledger and dashboard see one uniform shape.

```
ErrorNutrient {
  trace_id:       string          // same trace as the originating request — threads the whole journey
  capability_id:  string          // which capability-biome failed (cap-reg id)
  failure_class:  enum            // one of the five (§4)
  retryable:      boolean         // is retrying THIS capability plausibly useful? (false for bad_request; false for deadline_hit same-path; true for transient unreachable)
  partial_result: object | null   // present for `degraded` (the low-confidence/partial output); null otherwise
  cost_so_far:    number          // USD spent on this attempt before failing — the budget ledger decrements this even on failure
  attempts:       integer         // internal retry count the capability burned (level-1 chain depth) — dashboard shows retry depth
  detail:         string          // human-readable cause ("Brave 429, Playwright timeout, Puppeteer captcha unsolved") — for logs/operator, NOT branched on
  timestamp:      string          // ISO-8601, when the failure was finalized
}
```

Field rationale (why each earns its place):

- **`trace_id`** — without it the failure is orphaned from its request; no dashboard story, no ledger attribution. Non-negotiable.
- **`capability_id`** — level 3 can't pick a fallback or report "comp-intel failed" without knowing who failed.
- **`failure_class`** — the branch point (§4).
- **`retryable`** — a fast pre-judged hint so the orchestrator doesn't re-derive retry-ability from the class every time. Note it's distinct from class: `unreachable` may be retryable (transient) or not (decommissioned); the capability/bus sets this based on what it actually saw.
- **`partial_result`** — the home for `degraded` output. Without it, a partial result has nowhere to ride and is lost.
- **`cost_so_far`** — failures still cost money (a cultivation can burn $17 and fail). The ledger must attribute it or budgets silently under-count.
- **`attempts`** — surfaces level-1 retry depth to the dashboard; also a signal that a capability is chronically flaky (high attempts even on success).
- **`detail`** — operator/log breadcrumb. Explicitly **not** machine-branched (that's `failure_class`), so it can be free text.
- **`timestamp`** — ordering on the trace; latency-to-failure metrics.

## 6. What this contract does NOT decide (and why)

Per the scope guard, this doc defines the **interface**, not the recovery **policy**. The following are downstream consumers of this contract, deferred until their dependencies resolve:

- **Fallback-biome selection.** *When* the orchestrator gets an `exhausted`/`unreachable`, which other biome does it try? This depends on cap-reg resolution (white paper §6.7), an unsolved reliability problem (~50% capabilities undiscovered when the cap-reg step is skipped). Designing selection policy before §6.7 means building on parked foundations.
- **Partial-result composition.** Three parallel leaves, one returns `degraded` and one `deadline_hit` — does the orchestrator compose a partial answer or fail the whole task? This depends on Tier-2/Tier-3 composition mechanics (white paper §6.2, deferred to "dynamic later").
- **User-facing failure surfacing.** How a failure reads to the iMessage user (and whether it offers a retry) is a product/UX decision that rides on the safety tier (§6.5) and statefulness (§6.4) seams.

When §6.2 and §6.7 are resolved, that policy becomes a clean follow-on: it *consumes* the `ErrorNutrient` defined here without changing it. That is the sequencing payoff of designing the interface first.

## 7. Decisions locked

- **Three levels**, each handling only what it alone can know; **level 1 (capability-internal fallback) is unchanged.**
- **Bus enforces the `deadline` (authoritative); capability self-budgets within it.** Resolves the still-working-vs-gave-up race.
- **Five-class failure taxonomy:** `exhausted` · `deadline_hit` · `unreachable` · `bad_request` · `degraded`.
- **`degraded` carries its partial result** — it is both a failure marker and a partial success.
- **Full `ErrorNutrient` schema** (§5), trace/cost fields mirroring the request envelope for uniform ledger + dashboard consumption.
- **Interface designed; recovery policy deferred** to its dependencies (§6.2, §6.7).

---

*This is a design artifact, not an implementation plan. Next step: feed it (with the white paper) into the writing-plans process when build sequencing is decided.*
