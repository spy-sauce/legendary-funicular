# Async / Long-Running Reply Contract

> **Status:** Design sub-doc · v1 · 2026-05-29
> **Author:** SPY (Sean Young) + Cosmo
> **Scope:** The contract by which a result — produced milliseconds or minutes after the request — finds its way back to the caller. Resolves §6.3 of the [bus-mediated architecture white paper](./mycelium-bus-product-architecture-whitepaper.md) — the async-reply seam flagged as blocking any real deployment, because a multi-minute cultivation cannot hold an open synchronous connection to an iMessage user.
> **Explicitly out of scope (deferred):** the *durable store* for the reply-routing tuple (depends on §6.4 statefulness) and the *correlation policy* for inbound messages arriving mid-flight (interrupt/queue/ignore — also §6.4). This doc designs the **interface**; the **policy and persistence** that consume it are a clean follow-on. Same interface-not-policy discipline as the [failure handoff contract](./mycelium-failure-handoff-contract.md).

---

## 1. The problem

A synchronous request/response works when the answer is sub-second: the front door holds the connection, the result comes back, it replies. That model breaks the moment the work outlives the patience of the channel:

- A Tier-3 cultivation can run for minutes. No iMessage thread holds an open socket that long.
- The spend-gate is *already* async: triage texts "build X, ~$Y, go?" and must wait — possibly minutes — for a human reply over the same channel before any work starts.
- The user can wander off and the answer must still arrive when it's ready, over the channel they originally used.

The trap this contract avoids: **a result that is produced but cannot find its way home.** A nutrient finishes deep in a cultivation, and nothing knows which front door, which channel, or which person to hand it to. The deliverable here is the contract that guarantees every result — and every [ErrorNutrient](./mycelium-failure-handoff-contract.md) — can route back to its origin, whenever it lands.

## 2. The reply is already half-specified by the envelope

The locked request envelope (white paper §3.3) carries the exact routing tuple a reply needs:

```
{ intent, origin_channel, identity, budget_cap, trace_id, deadline, reply_to }
                ^^^^^^^^^^^^^^^^^^^^                ^^^^^^^^            ^^^^^^^^
                who/where to deliver to             threads it         routes it back
```

The delivery path is symmetric for success and failure — both ride the same trace home:

```
result nutrient OR ErrorNutrient (carries trace_id)
   → bus routes by reply_to
   → the front-door biome that injected the intent
   → delivers over origin_channel to identity
```

**A synchronous reply is just the degenerate case of this contract** — the gap between request and result is sub-second, so the routing tuple never has to leave memory and the front door simply holds the line. Async is the same contract with the gap widened. There is no second mechanism; there is one reply path, sometimes fast.

## 3. Reply-channel kinds — one path, three kinds of traffic

**Decision: the reply channel is progress-capable, not final-only.**

A final-only channel (terminal result only) forces a *separate* mechanism for the spend-gate round-trip — duplicated machinery doing the same job (route a nutrient back to `reply_to` mid-flight), where a routing fix in one silently rots in the other. Progress-capable unifies them: progress pings, the spend-gate prompt, and the terminal answer are all just nutrients on the reply channel, distinguished by a `kind` field — **not** by which mechanism carried them.

Critically, this adds **no streaming layer**. The bus is already a nutrient-passing fabric; a progress nutrient is the same envelope shape as a result nutrient with a different `kind`. We are adding an enum value, not a protocol.

| `kind` | Carries | Authoritative? | Decrements ledger? |
|---|---|---|---|
| `progress` | "Still working — ~3 min left", a heartbeat, a stage marker | **No** — fire-and-forget | No |
| `confirm_required` | The spend-gate prompt: "build X, ~$Y — reply GO to proceed" | **No** — it pauses, awaiting an inbound reply | No (the build hasn't run) |
| `result` | The terminal answer (or [ErrorNutrient](./mycelium-failure-handoff-contract.md)) | **Yes** — the single source of truth | **Yes** — final cost settles here |

### The guardrail that keeps this clean

**Only the terminal `result` nutrient is authoritative.** `progress` and `confirm_required` are non-authoritative by contract. This earns two things:

- **No false answers.** "Still working ~3min" can never be mistaken for the answer, because only `result` settles the trace.
- **No accidental delivery guarantees.** Progress nutrients are explicitly fire-and-forget. If one is dropped, the trace is unharmed — the terminal `result` still lands. This keeps the contract from requiring at-least-once delivery on progress, which *would* drag in the durable-store/statefulness concern (§4) that we are deliberately deferring. Only the terminal result needs the durable routing tuple; progress can ride best-effort.

The spend-gate is no longer special. It is the first `confirm_required` nutrient on the same path every other reply uses.

## 4. Where the routing tuple lives — the interface/policy split

This is the seam where §6.3 hands off to §6.4 (statefulness). The split is exact:

| | **Interface — designed here (§6.3)** | **Policy — deferred (§6.4)** |
|---|---|---|
| The tuple | `trace_id → reply_to → origin_channel → identity` — the shape a reply needs | — |
| The requirement | *That* the tuple must be **resolvable at delivery time**, however long after the request that is | — |
| The store | — | *Whether* it lives in-memory or in a durable store that survives a process restart |

- A sub-second lookup holds the tuple in memory and never thinks about persistence.
- A multi-minute cultivation that might outlive a process restart needs the tuple **durable** — and a durable request→reply mapping *is* statefulness. That is §6.4's job.

So this contract specifies the **obligation** (the tuple is resolvable when the result lands) without specifying the **store** (where it's kept to make that true). The terminal-result-only-is-authoritative guardrail (§3) means *only* the terminal result actually depends on the durable tuple — progress can be best-effort against an in-memory cache, so the durability requirement is as small as possible.

## 5. Inbound correlation — field now, policy deferred

Async means the user can send a *second* message while the first is still cooking. The contract must be able to *express* the relationship even though it does not yet decide what to do about it.

**Decision: define the field; defer the policy.**

The request envelope gains one optional field:

```
relates_to: trace_id | null   // does this new intent reference an in-flight trace?
```

- `null` (default) — a fresh, independent intent. Gets its own new `trace_id`.
- a `trace_id` — this intent references an in-flight trace (e.g. the user replying "GO" to a `confirm_required`, or "actually, cancel that").

**What is deferred (to §6.4):** the *policy* — when `relates_to` is set, does the system **interrupt** the in-flight trace, **queue** the new intent behind it, **ignore** it, or **fold** it in? That decision needs the statefulness model (you cannot interrupt or resume a trace you cannot durably address). Designing the policy before §6.4 means building on a parked foundation.

But the **field must exist now**, because without it the question is inexpressible later — and the spend-gate's "reply GO" round-trip is itself the first consumer of correlation: that reply *is* an inbound intent with `relates_to` set to the gated trace. The minimal v1 binding the spend-gate needs (a GO/cancel reply correlates to its trace) is the narrow slice that works without the full policy; everything richer waits for §6.4.

## 6. What this contract does NOT decide (and why)

Per the scope guard, this doc defines the **interface**, not the persistence or policy:

- **The durable reply-tuple store.** Where `trace_id → reply_to → identity` lives so it survives a restart. This is statefulness (§6.4). This contract only requires that the tuple be *resolvable at delivery time*; the store that guarantees it is downstream.
- **Inbound correlation policy.** Interrupt / queue / ignore / fold for a `relates_to` intent (§5). Requires the statefulness model (§6.4).
- **Delivery guarantees on the terminal result.** At-least-once vs exactly-once vs best-effort for the authoritative `result` nutrient is a reliability decision that rides on the durable store — once there's a store, "did the reply actually get delivered, and do we retry?" becomes answerable. Progress nutrients are contractually best-effort (§3) and need no such guarantee.
- **User-facing surfacing.** How a progress ping or a `confirm_required` *reads* to the iMessage user, and the wording/affordance of the GO reply, is a product/UX decision on the safety-tier (§6.5) and statefulness (§6.4) seams.

When §6.4 is resolved, the durable store and correlation policy become clean follow-ons: they *consume* the `kind` enum, the routing tuple, and the `relates_to` field defined here without changing them. That is the sequencing payoff of designing the interface first.

## 7. Decisions locked

- **One reply path, not two.** Sync is the degenerate (sub-second, in-memory) case of the same async contract. The routing tuple is `trace_id → reply_to → origin_channel → identity`, already carried by the request envelope.
- **Progress-capable channel** via a `kind` field: `progress` · `confirm_required` · `result`. Chosen because it *removes* a duplicate mechanism (the spend-gate stops being special), not because it adds streaming — it's an enum value on the existing nutrient shape.
- **Only the terminal `result` is authoritative** and settles the ledger; `progress`/`confirm_required` are non-authoritative and fire-and-forget. This guardrail prevents false answers and keeps delivery guarantees (and thus statefulness) off the progress path.
- **Inbound correlation: field now (`relates_to`), policy deferred** to §6.4. The spend-gate GO/cancel reply is the first, narrowest consumer.
- **Interface designed; persistence + policy deferred** to statefulness (§6.4). This contract requires the routing tuple be *resolvable at delivery*; it does not decide the store.

---

*This is a design artifact, not an implementation plan. It pairs with the [failure handoff contract](./mycelium-failure-handoff-contract.md) — together they cover the two seams (§6.1, §6.3) flagged as blocking deployment. Next deployment-blocking seam after this: statefulness (§6.4), which both this contract and the failure contract hand off to. When build sequencing is decided, feed these into the writing-plans process.*
