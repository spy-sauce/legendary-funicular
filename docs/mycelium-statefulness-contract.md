# Statefulness Contract — The Trace Record

> **Status:** Design sub-doc · v1 · 2026-05-29
> **Author:** SPY (Sean Young) + Cosmo
> **Scope:** The durable state that lets a request survive time and process restarts. Resolves §6.4 of the [bus-mediated architecture white paper](./mycelium-bus-product-architecture-whitepaper.md) — the statefulness seam that both the [failure handoff contract](./mycelium-failure-handoff-contract.md) (§6.1) and the [async reply contract](./mycelium-async-reply-contract.md) (§6.3) hand off to. **This is the capstone of the deployment-blocking trio:** once it lands, §6.1/§6.3/§6.4 are all interface-resolved.
> **The floor, not a deferral.** The prior two contracts deferred persistence and correlation *to here* precisely because they refused to decide them. So this doc cannot defer downward forever — it is where the floor is poured. It still splits, but along **lifetime**, not along interface-vs-policy: ephemeral per-trace state (designed now, deployment-blocking) vs durable per-identity memory (deferred, product semantics).

---

## 1. The problem

Two prior contracts each ended at the same wall:

- The async contract needs the reply-routing tuple (`trace_id → reply_to → origin_channel → identity`) to be **resolvable at delivery time** — possibly minutes later, possibly after a process restart. It explicitly did not decide *where that tuple lives*.
- The failure contract's `ErrorNutrient` carries `cost_so_far`, and the async contract's terminal `result` settles the ledger — both assume a **per-trace budget that something is tracking** across the life of the request.
- The async contract added a `relates_to` field for inbound correlation but deferred the *policy*, because "you cannot interrupt or resume a trace you cannot durably address."

Every one of these is the same missing thing: **a durable record of a request that outlives the moment it was made.** The trap this contract avoids is a request that exists only as an in-flight function call — so when the process restarts, the cultivation that's still running has no home to deliver to, no budget to settle against, and no addressable identity to correlate a follow-up to. The deliverable is that record.

## 2. The load-bearing collapse: it is ONE record, not three stores

The naive reading sees three separate concerns — reply addressing, lifecycle status, budget tracking — and reaches for three stores. They are not three things. **They are three field-groups of a single record, keyed by `trace_id`, sharing one lifetime** (born when the intent is injected, TTL'd to trace completion).

```
TraceRecord {                         // keyed by trace_id · lifetime = request duration
  trace_id:        string             // the key

  // ── addressing (from the request envelope) ── how a reply gets home
  reply_to:        string             // which front-door biome delivers
  origin_channel:  string             // imessage / phone / cc / …
  identity:        string             // who to deliver to

  // ── lifecycle ── is this trace still live?
  status:          enum               // pending / in_flight / awaiting_confirm / done / failed
  updated_at:      string             // ISO-8601, last transition

  // ── budget ── per-trace spend, same lifetime
  budget_cap:      number             // from envelope; the hard ceiling
  spent_so_far:    number             // decremented by cost_so_far on each attempt; settled by terminal result
}
```

Why the collapse is correct, field-group by field-group:

- **Addressing** is set once at injection and read once at delivery. It is the async contract's tuple, made durable.
- **Lifecycle** is the precondition for *everything else* — you cannot correlate, interrupt, or report on a trace whose status you can't read. It is the cheapest possible answer to "is this still going?"
- **Budget** has *exactly the same lifetime* as the trace. `spent_so_far` **accumulates** each attempt's `ErrorNutrient.cost_so_far` (failures still cost money) and is settled by the terminal `result`. The accumulation is additive-per-attempt, so a retry adds its own cost rather than overwriting — never double-counting. Putting it anywhere else would split one lifetime across two stores for no reason.

This collapse — **one trace record, one store, one lifetime** — is the part that genuinely unblocks the prior two contracts. It is not deferrable.

## 3. Lifecycle states

A small, closed status enum. Deliberately minimal — just enough to answer "is this trace live, and if so, what's it waiting on?"

| `status` | Meaning | Set by |
|---|---|---|
| `pending` | Trace record created; work not yet dispatched. | Front door / triage at injection |
| `in_flight` | Work is running (a capability call, a cultivation). | Triage / orchestrator on dispatch |
| `awaiting_confirm` | Paused on a `confirm_required` nutrient (the spend-gate); waiting for a human GO/cancel. | Triage when it emits the spend-gate prompt |
| `done` | Terminal `result` delivered; budget settled. **Eligible for TTL expiry after a grace window** (not reclaimed on completion — a late `relates_to` follow-up must still resolve). | Orchestrator on terminal result |
| `failed` | Terminal `ErrorNutrient` delivered. **Eligible for TTL expiry after a grace window** (not reclaimed on completion — a late `relates_to` follow-up must still resolve). | Orchestrator / bus on terminal failure |

`awaiting_confirm` earns its place as a distinct state because it is the *one* status a follow-up message can legitimately correlate to in v1 (§4). Everything else is the obvious request lifecycle.

### `awaiting_confirm` suspends the deadline — a cross-seam resolution

The failure contract makes the envelope `deadline` a **hard, bus-enforced outer bound**: if it passes with no result, the bus kills the call and emits `deadline_hit`. But that deadline is sized for **compute** — and `awaiting_confirm` waits on a **human**, possibly for minutes or hours. Left unreconciled, the bus would fire `deadline_hit` and kill a trace that is legitimately paused on the spend-gate. The spend-gate is a v1 feature, so this interaction is itself deployment-blocking — and resolving it is precisely the capstone's job.

**Resolution (locked):**
- **Entering `awaiting_confirm` suspends the envelope `deadline`.** A human's response time is not the compute budget; the compute clock does not run while no compute is happening.
- **The confirmation wait carries its own, separate, longer timeout.** Its expiry transitions the trace to `failed` (cancelled), with **no spend accrued** — consistent with budget-being-per-trace: a paused trace spends nothing.
- **On GO, the trace returns to `in_flight` and the compute `deadline` resumes** (from where it was suspended, not reset).

This is the one place the three contracts' clocks interact, and the trace record — which owns both `status` and the lifecycle transitions — is the right home to resolve it.

## 4. Correlation — minimal binding is floor, general policy deferred

This is where the discipline gets tested. The async contract deferred *all* correlation policy to §6.4 because addressing wasn't durable yet. **§2 just made it durable** — so deferring all of correlation again would be reflex, not reasoning. The cut:

### Floor (design now — deployment-blocking)

The spend-gate is an async round-trip: triage emits `confirm_required`, the trace goes `awaiting_confirm`, and the user replies "GO" or "cancel." **That reply is an inbound intent with `relates_to` set to the gated trace** — and binding it is *not optional for v1*, because the spend-gate is a v1 feature and a spend-gate whose confirmation can't find its trace is broken.

The minimal binding, fully specified:

- An inbound intent with `relates_to = <trace_id>` is looked up in the trace store.
- If that trace is `awaiting_confirm`: a recognized affirmative resolves it to `in_flight` (work proceeds); a recognized cancel resolves it to `failed` (no spend). **This is the only correlation v1 must support.**
- An inbound intent with `relates_to = null` (the default) **always starts a fresh trace.** This is the locked v1 default — simple, safe, no ambiguity.

### Deferred (product semantics)

The **general correlation policy** — an arbitrary message arriving mid-flight against an `in_flight` trace: does the system **interrupt** it, **queue** the new intent, **ignore** it, or **fold** it in? This now *can* be designed (the lifecycle states exist), but it is a richer product decision with real UX weight ("you said cancel while it was building — do we stop and refund the partial spend?"). It is deferred, not blocked. The v1 default above ("non-correlated inbound = fresh trace") means the system behaves coherently without it.

## 5. The durable store — interface, with the scale question named, not assumed

**Decision: the contract specifies the store's *operations*, not its backend.** SQLite (WAL, via Frank's canonical `StateStore` / `redis-connect` helper) is named as the **reference / v1 implementation**, not as the contract.

The reason this is deliberately abstract: **it is not yet established that SQLite is the right backend at scale**, and the design must not silently assume it is. The store interface is what the product repo will implement; the backend is an implementation decision to be made against measured pressure, not baked into the design doc.

Required operations:

```
TraceStore interface
  put(trace_id, TraceRecord)            // at injection
  get(trace_id) → TraceRecord | null    // at delivery, at correlation lookup
  set_status(trace_id, status)          // each lifecycle transition
  add_spend(trace_id, amount)           // ADDITIVE per-attempt: amount = ErrorNutrient.cost_so_far
                                        // (this attempt's spend), accumulated into spent_so_far.
                                        // A retry adds a new attempt's cost; it never overwrites — no double-count.
  expire(trace_id)                      // reclaim AFTER a TTL grace window on done/failed (not on completion)
```

**The scale question, stated for whoever evaluates the backend later** — the pressures a trace store actually faces, so SQLite-vs-alternative is a *measured* call:

- **Status-transition write rate.** Every trace writes `put` once and `set_status` several times; high concurrent-trace volume means sustained small writes. SQLite WAL handles moderate write concurrency but has a single-writer ceiling — the question is where that ceiling sits relative to peak concurrent traces.
- **TTL/expiry sweep cost.** `done`/`failed` records must be reclaimed. A periodic sweep vs. lazy expiry-on-read is a real choice with different cost profiles at scale.
- **Concurrent-trace fan-out.** A single Tier-3 cultivation spawns many leaves; if leaves write spend against the parent trace, `add_spend` contention on one record is a hotspot worth measuring.

Naming these is the deliverable. *Choosing* the backend against them is downstream — and belongs in the product repo, not this design doc.

## 6. What this contract does NOT decide (and why)

Per the lifetime split, this doc designs the **ephemeral per-trace record**. The following live at a *different lifetime* (durable, per-identity, across sessions) and are deferred to product semantics on the colleague↔product boundary (§3.7) and safety tier (§6.5):

- **Conversational memory.** "Make it shorter" referring to the last answer; cross-session recall; what Maui remembers about a person and their org over days and weeks. This is per-*identity*, not per-*trace* — a fundamentally different lifetime — and is the heart of the colleague↔product boundary. Not deployment-blocking; a coherent v1 ships with stateless-across-sessions behavior.
- **Per-identity budget allowance.** If "this user gets $X/month" ever exists, it is durable per-identity state with the same lifetime as conversational memory — explicitly **kept out of the ephemeral trace record.** The trace record holds only the *per-request* `budget_cap` from the envelope; where that cap *comes from* (a per-identity allowance) is a separate, deferred store.
- **General correlation policy.** Interrupt/queue/ignore/fold for a mid-flight `in_flight` trace (§4). Deferrable now that lifecycle states exist; gated on product UX decisions.
- **Backend selection + delivery guarantees.** Whether the store is SQLite or something else (§5), and whether terminal-result delivery is at-least-once/exactly-once (async contract §6) — both ride on the store, which this contract defines by interface only.

## 7. Decisions locked

- **One trace record, not three stores.** Addressing + lifecycle + budget are field-groups of a single record keyed by `trace_id`, sharing one lifetime (TTL'd to completion). This collapse is what unblocks the prior two contracts.
- **Closed lifecycle enum:** `pending` · `in_flight` · `awaiting_confirm` · `done` · `failed`. `awaiting_confirm` is the one state a v1 follow-up can correlate to.
- **`awaiting_confirm` suspends the envelope `deadline`** (cross-seam resolution with the failure contract): the compute clock doesn't run while waiting on a human. The confirmation wait has its own separate longer timeout; its expiry → `failed`, no spend. On GO, `deadline` resumes (not reset). This is the one place the three contracts' clocks interact.
- **`spent_so_far` is additive-per-attempt**, accumulating each `ErrorNutrient.cost_so_far`; a retry never overwrites. **Records expire after a TTL grace window** on `done`/`failed`, not on completion — a late correlation must still resolve.
- **Correlation split by necessity:** the spend-gate GO/cancel binding (a `relates_to` reply resolving its `awaiting_confirm` trace) is **floor, designed now**; the general mid-flight policy is **deferred**. v1 default: non-correlated inbound starts a fresh trace.
- **Budget is per-trace state**, living in the trace record; **per-identity allowance is deferred** to per-identity memory, kept out of the record.
- **Store defined by interface** (`put`/`get`/`set_status`/`add_spend`/`expire`); SQLite is the reference impl, **not the contract.** The scale question is named (write-rate, TTL sweep, fan-out contention) so backend selection is a measured downstream call.
- **Conversational memory deferred** — different lifetime, per-identity, colleague↔product boundary. A coherent v1 ships stateless across sessions.

---

*This is a design artifact, not an implementation plan. It is the **capstone** of the deployment-blocking trio — with the [failure handoff contract](./mycelium-failure-handoff-contract.md) (§6.1) and the [async reply contract](./mycelium-async-reply-contract.md) (§6.3), the three seams that block real deployment are now interface-resolved. The remaining §6 seams (safety tier §6.5, cap-reg resolution §6.7, harm-gate §6.8) were all explicitly marked not-v1-blocking. Next move: feed the three contracts into the writing-plans process to produce an implementation plan for the floor.*
