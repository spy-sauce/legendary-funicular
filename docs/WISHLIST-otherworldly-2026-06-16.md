# Mycelium — The "Otherworldly" 15
### C-Suite aspirational wishlist · authored 2026-06-16

> **Companion to** `docs/BACKLOG-parked-2026-06-16.md`. The backlog is the consolidation roadmap (what earns the right); this is the aspirational roadmap (what makes it a phenomenon). They are the same roadmap seen from two ends — almost every Horizon-2/3 myth below is gated behind the parked backlog's Tier 0.
>
> **Method:** 6 executive personas (CTO, CPO, CMO, CISO, CRO, Chief Scientist) generated 36 ideas → independent judges blind-scored each on Impact/Feasibility/Moat/Wow (each 1–10, /40) → CEO cut to the ranked 15. Scores were input, not gospel: low-feasibility moonshots gated behind the unbuilt eval harness + worktree isolation were *rescued and sequenced* rather than cut, because this is a wishlist where the foundation is allowed to be built in. Overrides are noted inline.

---

## 🌱 HORIZON 1 — Now-ish (earns the right to be a phenomenon)

**1. The Living Leaderboard — pass^3 in public** · `NARRATIVE`
Public arena where Mycelium cultivates real apps from public goal-tickets, live, with every leaf's lifecycle + final reliability score streamed. Converts the project's biggest weakness (zero reliability data) into unfakeable 24/7 adversarial proof — the spectacle IS the eval.
*Seed: eval-spec pass@k/pass^3 × bus trace_id observability × audit-run behavioral layer. CMO/CPO converged.*
*Override: scored F4 (gated on eval engine); kept #1 as the forcing function that makes the foundation get built.*

**2. Text a Sentence, Get a Shipped Product** · `PRODUCT`
Non-engineer texts "build me a booking site with deposits" → one-line quote back → "yes" → minutes later a live URL in the same thread. The most screenshot-able moment Mycelium can produce.
*Seed: three signed-off bus contracts (iMessage front-door → triage → spend-gate quote → async-reply-routed result). CPO/CRO converged (also the mid-market wedge).*
*Tension resolved: ship the front half now (SMS→triage→quote→Tier-1/2 lookup) as the viral demo; gate the autonomous Tier-3 "stranger ships software unattended" beat behind #1 (reliability) + #3 (harm gate). Don't fake the back half.*

**3. The Harm Gate — a permission membrane for what a leaf may DO** · `TRUST`
A second gate beside the spend-gate scoring capability *effects* not cost: every action (write where, send to whom, touch which PII) pre-flighted against a per-trace effect budget in the envelope; irreversible effects fire the same `confirm_required` nutrient the spend-gate uses. The load-bearing wall the headless-autonomy thesis leans on but never built.
*Seed: whitepaper §6.8 names this gap verbatim; confirm_required plumbing + per-trace ledger already exist. Highest blended score, 32/40.*

**4. Quote-Priced Outcomes — kill the per-seat model** · `REVENUE`
Price the work not the seat: spend-gate already shows "build X, ~$Y, go?" before a cent is spent; trace ledger settles actual against cap. Reframes the category off token-anxiety.
*Seed: §3.2 three-tier triage + statefulness TraceRecord (budget_cap/spent_so_far). The billing primitive is already inside every request.*

**5. Your One-Off Build Becomes Everyone's Superpower** · `REVENUE`
Operator promotes a genuinely-useful cultivation output through a review gate into a permanent capability-biome; next person gets it as a Tier-1 lookup instead of a fresh build. The organism accretes proven capability from users' work — the network-effect engine.
*Seed: whitepaper §3.6 promotion gate + cap-reg descriptors. FOUR execs converged (CPO/CRO/CTO/Scientist) — strongest convergence in the exercise.*

---

## 🌳 HORIZON 2 — The Leap (12–24 months)

**6. The Reliability Genome — a pass^k dataset nobody else can have** · `TECH`
Every cultivation ever, run through worktree-isolated trials against pinned commits, recording pass^k/cost/wall-time per leaf-class/model/harness — until Mycelium predicts pass^k and cost *before spawning a leaf*. Usage-accrued, determinism-anchored data money can't buy.
*Seed: eval-spec worktree trials + router chokepoint cultivate.ts:480. Feeds #1 and #8.*

**7. The Continuous Self-Audit Immune System** · `TRUST`
audit-run becomes a standing biome continuously re-auditing the live organism (every promoted capability, every deployed fruiting body) against frozen contracts, raising `degraded` and quarantining drift. The system that built itself now watches itself.
*Seed: audit-run shipped+proven; `--against <ref>` regression mode exists; ErrorNutrient gives degraded/unreachable signals. CISO/CTO converged.*

**8. Learned Triage — the router that earns the right to spend money** · `SCIENCE`
Triage as a learned classifier trained on its own trace_id outcomes (request→tier→actual cost→judge pass), self-calibrating tier boundaries + cap-reg resolution with the spend-gate as hard floor. The whitepaper's own highest-risk seam (§6.7: ~50% of capabilities go undiscovered) — and the audit trail already emits the labels for free.
*Seed: §3.2 tiers + §6.7 resolution problem + eval Lane C.*

**9. Capability Tokens — a cryptographic visibility membrane per caller** · `TRUST`
Safety tier becomes a signed, trace-bound token minted at the front door; a capability-biome won't even respond without a valid token, so recon/OSINT biomes are *unaddressable* (not merely hidden) to the product tier. Lets one fleet safely serve operator + enterprise + public.
*Seed: §3.7 safety tier + operator-door/product-door asymmetry (§3.1); envelope is the natural token carrier.*

**10. Harness-Agnostic Cultivation — same contract, any agent runtime** · `TECH`
A leaf is defined by HYPHA + NUTRIENTS + artifact contract — none SDK-specific — so make the runtime pluggable: same frozen contract on Claude SDK / Codex / Cursor / local model, genome routes each leaf-class to its best harness. No model vendor can hold the platform hostage.
*Seed: Router Lane A/B proves :480 is swappable; eval-spec names multi-harness v2. Highest moat score, M9.*

**11. Replayable Trust — re-execution as the compliance artifact** · `TRUST`
trace_id through one envelope against frozen contracts with recorded model versions → a completed cultivation is replayable; an auditor re-runs the recipe and proves the agent did exactly and only what the record claims. "Show me" replaces "trust me."
*Seed: reproducibility is the Framework layer's core discipline; durable trace record + JSONL sinks are the replay tape.*
*Override + caveat: scored 25/40 — bit-for-bit determinism breaks on live LLM APIs + side-effecting tools. Scoped to "contract-and-effect replay" (did it honor the frozen contract + stay within the effect budget), NOT bit-exact re-derivation. That weaker claim is the SOC2/discovery goldmine.*

---

## 🔮 HORIZON 3 — The Myth (sci-fi bets — each names its kill-experiment)

**12. Make the Mesh Real — nutrient-flow rescheduling from a frozen spec** · `SCIENCE`
Implement the inert six-signal vocabulary for real: finished leaf broadcasts OFFER, stalled leaf broadcasts REQUEST, orchestrator routes idle compute toward the blocked sibling mid-cultivation. Converts Mycelium's central honest-lie into its hardest moat.
*Seed: flow.ts literally sleep(400)s over a REAL dependency graph; runWithConcurrency + CommitQueue exist; only the inter-leaf channel is missing.*
*Tension named: Chief-Scientist purity ("the organism must become real") vs CPO pragmatism ("ship the SMS demo, the mesh is theater"). Resolution: #2 ships first and funds the company; #12 makes the BRAND true. Gate #12 behind worktree isolation (backlog 0.1) — work-stealing across a shared git tree is the race that's already bitten 3×. Kill-experiment: implement OFFER/REQUEST on the JSONL bus for a 2-leaf toy cultivation; if rescheduled compute doesn't beat static fan-out on wall-time at equal cost, the mesh is poetry.*

**13. The Self-Healing Forest — a framework that cultivates its own improvements** · `SCIENCE`
Close the proven audit-run loop into a standing meta-cultivation: continuously audit the framework, open findings as HYPHAs, cultivate the fix in an isolated worktree, gate through eval, promote only if pass^k is non-decreasing. The improver is itself a cultivation — a second-derivative moat whose accrued history is the asset.
*Seed: audit-run already healed a real TS bug and re-verified clean (W9).*
*Override: scored F5; judge nailed the risk (it edits the same cultivate.ts it runs on; Bug 5 means verify currently re-emits baseline). Kept top of Horizon 3 as THE category-defining story — hard-gated behind backlog Tier 0 (worktree isolation + eval baseline + Bug 5 fix). This is the prize the consolidation backlog exists to earn.*

**14. Eval-Genetics — cultivations that breed from their own pass^k history** · `SCIENCE`
Run each leaf 3 ways, keep the variant passing deterministic judges fastest/cheapest, mutate losers toward it; over dozens of cultivations the framework's own decomposition strategy evolves — winning HYPHAs become templates, flaky ones get pruned.
*Seed: eval-spec pass^k + worktree + judges; TCF §5 "learned base_weight from task outcomes." Kill-experiment: does directed prompt-mutation actually raise pass^3 across a fixed suite, or just overfit the judges?*

**15. TCF — the time-aware substrate that makes context compound** · `SCIENCE`
Build the Temporal Context Framework as Mycelium's shared memory: every nutrient (commit, HANDOFF entry, frozen contract, eval result) carries a decaying relevance score, so cultivations stop re-deriving context and resolved issues stop resurfacing. Aims at the field's real bottleneck — context, not reasoning — and is the most buildable Horizon-3 bet (F7, full v0.2 spec exists).
*Seed: docs/temporal-context-framework.md is a complete spec; frozen NUTRIENTS IS the FROZEN decay profile already in production.*
*Honest note: the core TRS triad ≈ published Generative-Agents recency×importance×relevance + an HLC — solid engineering, not novel research. Kept because it's the substrate #8/#13/#14 quietly assume; operator-HYPHA dogfood (SPY's actual work-week) is a uniquely compelling proof.*

---

## THE THROUGH-LINE

Mycelium becomes a phenomenon when it stops *describing* a living organism and starts *being* one in the two checkable places: **it proves its own reliability in public (the leaderboard) and improves itself in public (the self-healing forest)**, while a single envelope makes every request priced-before-spent, effect-bounded, and replayable. The biology stops being marketing and becomes the architecture; the honesty about current gaps becomes the spectacle that closes them.

**If we only did three:** **#1 Living Leaderboard** (turns the reliability deficit into the marketing moat + forces the eval foundation), **#3 The Harm Gate** (the one trust primitive that unlocks the headless-autonomy category), **#2 Text-a-Sentence-Get-a-Product** (the screenshot that makes a stranger care). Leaderboard earns belief, harm-gate earns trust, SMS demo earns attention — every Horizon-2/3 moonshot is downstream of those three landing.

---

*The full 36 blind-scored ideas (every exec's pitch, seed, and judge verdict) were generated in the 2026-06-16 C-suite workflow. The boring consolidation backlog and this otherworldly wishlist are the same roadmap from two ends.*
