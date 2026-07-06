# Mycelium — The "Otherworldly" 15
### C-Suite aspirational wishlist · authored 2026-06-29

**Weakness being weaponized:** "No reliability/eval baseline exists — there is zero formal pass@k or capability-regression data, so leaf-completion quality cannot be attributed to model vs prompt vs framework drift, and the engine is a parallel fan-out with no inter-leaf signaling (the 'living mesh / organism' is aspirational spec, not runtime). Converting this into a moat means shipping the eval harness BEFORE the Router chokepoint change (cultivate.ts:480) to lock a baseline, then making measured reliability — reproducible pass^3 on real cultivations like live-grid-run8 — the defensible, hard-to-copy claim competitors can't match."

The candidate pool is small (5 ideas, 4 distinct after de-duping the two near-identical Baseline-Lock pitches), so this roadmap deliberately decomposes each surviving idea into its load-bearing sub-bets and sequences them so the eval substrate is laid before anything that depends on it. The numbering is the rank. Where rank disagrees with raw score, the override is stated inline.

---

## 🌱 HORIZON 1 — Now-ish (earns the right)

**1. Noise-Band Probe — run the same task 3× before building anything** `SCIENCE`
Before writing a line of harness code, run a single capability task on live-grid-run8 three times and report the spread; this is the cheapest possible test of whether pass^k is even a meaningful signal on this engine.
*Seed:* Direct extraction of the kill-experiment both Baseline-Lock pitches volunteered [19/40, twice]; live-grid-run8 is a real end-to-end target [13]; `runWithConcurrency` already drives parallel trials [2]. All six execs converged across the two pitches (CPO+CTO+CMO+CISO+CRO+Chief Scientist).
*Override:* Neither parent idea scored this as a standalone item; it scores ~19 inherited. Ranked #1 anyway because it is the gating experiment for the entire reliability thesis — it costs an afternoon and tells us whether the moat is real before we spend a quarter building toward it. A roadmap that puts the moonshot before its own cheapest falsifier is malpractice.
*Kill-experiment:* If the 3 runs return uninterpretable noise (e.g. 0/3 every time, or wild variance with no signal), the "measured reliability" moat is dead on arrival and the whole Horizon-2 science track is cut. If the spread is interpretable, proceed to #2.

**2. Baseline Lock — eval harness shipped before the Router touches cultivate.ts:480** `SCIENCE`
Build `mycelium eval` and freeze a reproducible pass^3 number on live-grid-run8 BEFORE the Router chokepoint change, so future regressions become attributable to model-vs-prompt-vs-framework — the one claim no competitor with zero reliability data can make.
*Seed:* Eval-spec is build-ready and explicitly gates the Router phase-1 change at cultivate.ts:480 [14]; `runWithConcurrency` drives parallel trials [2]; live-grid-run8 is a real 10-biome target [13]; dogfood loop proven on audit-run [3]. Six-exec convergence across both Baseline-Lock pitches (CPO+CTO+CMO+CISO+CRO+Chief Scientist).
*Override:* Score 19/40 (I5 F9 M3 W2) — would land mid-pack on score alone. Ranked #2 because feasibility is 9/10 and it is a hard prerequisite for the entire science/moat track AND a time-boxed race against the Router change it gates. The low Moat (3) is honest — see #2's correction below — but the *internal* value (attribution ability) is real even if the *external* moat claim needs work. This is the substrate; everything downstream stacks on it.
*Kill-experiment:* (Contested feasibility — harness is spec-only, not built, and races the Router.) Ship the harness and run it twice on live-grid-run8 with the current engine; if pass^3 reproduces across runs, the baseline is real and lockable. If it varies, we've learned the engine is non-deterministic *before* we sell determinism — still a win, but the framing pivots from "reproducible anchor" to "stability snapshot."

**3. Attribution Honesty — pin what you can, label what you can't** `SCIENCE`
A thin layer over the eval harness that explicitly separates the controllable axes (framework commit, prompt, fixtures — all pinnable) from the uncontrollable one (silent model updates behind a stable id), so the reliability claim is "stability snapshot at a model-state," not the over-claimed "clean three-way attribution."
*Seed:* Directly answers the strongest surviving objection to Baseline Lock — that the harness "cannot hold the model axis constant" and the SDK won't let you freeze a model version (spec lines 26, 261). Pins framework commit + isolated worktree per trial (spec lines 115-119, 139). Chief Scientist + CISO own the rigor; CTO owns the plumbing.
*Override:* No standalone score — this is the refutation-survival made into a deliverable. Ranked #3 because shipping the moat claim without this correction means shipping a claim that collapses under the first skeptical buyer. Honesty about the model axis is what makes the *rest* of the number defensible.
*Kill-experiment:* (Contested feasibility — depends on SDK surfacing any model-version signal.) Capture the model id + any response-header version metadata across a week of runs; if Anthropic exposes *nothing* distinguishing model-states, label every baseline with a wall-clock date band and treat cross-date deltas as a noise band, not attribution. If even a coarse version signal exists, bind it to the baseline record.

**4. Agent-Fixes-Agent Corpus — start the self-repair dataset from day one** `SCIENCE`
Capture every dogfood + heal-loop trace as a structured (defect, fix, verification-outcome) record, beginning by mining the existing live-grid-run8 TS2353 receipt and one fresh heal-loop cycle — a moat asset that compounds with every cultivation and that no rival without the recursive engine can generate.
*Seed:* [3] proven dogfood loop (audit-run, 22/22 leaves in 332s) + [4] self-auditing heal-loop verified on a real TS2353 error in live-grid-run8 with replant-and-reverify. Six-exec convergence (Chief Scientist+CTO+CPO+CMO+CISO+CRO).
*Override:* Score 22/40 (I5 F8 M6 W3) — outscores Baseline Lock, yet ranked below it. Demoted because the corpus is N≈1 today (the objection that survived); it has no value until the eval harness (#2) is producing repeatable traces to label. The *mechanism* is high-feasibility (F8), but the *asset* doesn't exist until #2 feeds it. Start the schema now (cheap), let it compound after the harness lands.
*Kill-experiment:* (Contested feasibility — "compounding moat" is currently a projection.) Mine live-grid-run8 + one fresh heal-loop cycle into labeled records; if fewer than a handful of clean labeled episodes can be extracted per run, the corpus won't compound fast enough to matter — and the moat is just the generating mechanism, not an asset. Re-rank to Horizon 3 if extraction yield is thin.

---

## 🌳 HORIZON 2 — The Leap (12–24 mo)

**5. Verified-Deliverable Pricing — charge per clean fruit, not per token** `REVENUE`
Bill per cultivation deliverable that passes the autofix heal-loop and lands clean, so revenue compounds with every leaf shipped instead of every token burned — turning machine-defined "done" into the unit you sell.
*Seed:* [4] self-auditing autofix heal-loop verified against real code (found+fixed a real TS2353 in live-grid-run8) + [3] proven dogfood loop (22/22 leaves in 332s) make "done" machine-definable; [5] cost-tracker is the metering substrate that makes the verified-vs-cost margin billable. Five-exec convergence (CRO+CPO+CMO+CISO+Chief Scientist).
*Override:* Score 23/40 — the highest-scoring candidate in the pool — yet ranked #5, below four lower-scoring science items. This is the deliberate weakness-into-moat sequencing: the surviving objection is that "clean" is self-attested and gameable (HANDOFF bugs 2/3/5 prove the pass signal is currently fragile), so the moment the pass signal *is* the invoice line, both sides have incentive to manipulate it. You cannot sell verified-deliverable pricing until the verification is adversary-resistant — which is exactly what Horizon 1 builds. Gated behind #2 (repeatable pass metric) + #4 (corpus to calibrate the bar) + the heal-loop bug fixes. High impact, kept; sequenced after its prerequisites.
*Kill-experiment:* (Contested feasibility — billing metric is gameable today.) Re-run live-grid-run8 through the heal-loop twice and check whether the same fruit is judged "clean" both times AND whether an adversarial prompt can produce a fruit that passes the bar but fails human review. If the pass signal flips run-to-run or is trivially gamed, the invoice line isn't a meter yet — fix verification before pricing on it.

**6. Inter-Leaf Signaling — make the mesh real, not spec** `SCIENCE`
Add the first genuine inter-leaf communication to the engine (shared cache / nutrient-passing / cross-leaf findings) so the "living mesh / organism" stops being aspirational spec and becomes runtime behavior — closing the single biggest gap between the manifesto and the parallel fan-out that actually runs.
*Seed:* Verified memory fact — "zero inter-leaf signaling in cultivate.ts; organism/flow/mesh = aspirational spec not runtime." Cache-network + micro-agentic thesis already sketched (PR #3 branch, v9.2 design). This is the structural truth the weakness statement names. CTO + Chief Scientist + CPO converge.
*Override:* No card score (drawn from the verified weakness, not the candidate list). Ranked #6 in Horizon 2 because it is the highest-leverage *capability* leap, but it is gated behind #2 — you must lock a fan-out baseline *before* adding inter-leaf signaling, or you can never prove the mesh improved reliability vs. just changed it. This is the canonical "ship eval before the engine change" discipline applied to the engine's own evolution.
*Kill-experiment:* Wire one narrow signal (shared cache hit-rate across two leaves on the same cultivation) and measure pass^3 + call-count delta vs. the locked fan-out baseline. If signaling doesn't move reliability or cost, the "organism" is a metaphor, not a moat — keep the fan-out and stop gilding the spec.

**7. Adversarial Verification Layer — close heal-loop bugs 2/3/5** `SCIENCE`
Harden the verification engine so "clean" is adversary-resistant: testers actually re-run (kill bug 5), finding-SHA dedupe survives LLM summary variance (bug 3), and no_progress termination fires per spec (bug 2).
*Seed:* HANDOFF documents all three open framework bugs precisely; these are the exact fragilities the Verified-Deliverable-Pricing objection weaponizes. CISO + CTO + Chief Scientist converge.
*Override:* No card score — this is the de-risking prerequisite for #5 surfaced as its own item. Ranked #7 because it is the bridge between Horizon 1's measurement and Horizon 2's revenue: without it, the meter is gameable and #5 cannot ship. Lower than #5 in number only because #5 is the *goal* it unlocks; in execution order #7 precedes #5's launch.
*Kill-experiment:* After fixes, run the heal-loop on a known-defective fixture and confirm testers re-execute (not re-emit), dedupe holds across 3 runs with varying LLM summaries, and termination fires. If any of the three still leak, verification isn't trustworthy enough to bill on.

---

## 🔮 HORIZON 3 — The Myth (each names its kill-experiment)

**8. The Self-Repair Model — train on your own corpus** `SCIENCE`
Once the Agent-Fixes-Agent corpus (#4) has compounded across hundreds of cultivations, fine-tune or distill a defect→fix model that makes the heal-loop faster and cheaper than any prompt-only competitor — the recursive engine eating its own exhaust to get better.
*Seed:* Direct extrapolation of #4 [22/40, F8, six-exec convergence] past the N≈1 problem; only Mycelium's recursive dogfood engine can generate this data at all.
*Override:* Inherits #4's 22/40 but ranked in the Myth horizon because it is pure projection until the corpus exists at volume — the survived objection (corpus-too-thin) is fatal at today's scale and only resolves after years of cultivation traffic.
*Kill-experiment:* When the corpus crosses ~1k labeled episodes, hold out 20% and test whether a model trained on the rest predicts the correct fix better than the base model prompted cold. If no lift, the corpus is exhaust, not fuel — and the moat is the engine, not the dataset.

**9. Neutral Benchmark — the SWE-bench for cultivations** `SCIENCE`
Establish (or co-found) an external, third-party-judged cultivation benchmark so reliability numbers are portable and comparable, converting self-graded pass^3 into an industry-standard claim rivals genuinely can't fake.
*Seed:* Directly answers the strongest objection to the Baseline-Lock moat — "no shared external benchmark, no neutral third-party judge; self-graded numbers are marketing, not a moat." Builds on #2/#3's measurement substrate. Chief Scientist + CMO + CRO converge.
*Override:* No card score — this is the refutation ("the competitive framing is the weak seam") turned into the ultimate ambition. Myth horizon because it requires market coordination beyond a single vendor's control.
*Kill-experiment:* Submit Mycelium's pass^3 to one independent reviewer who re-runs the harness on their infra against tasks they pick. If the number survives a neutral re-run, the benchmark is fundable; if it collapses off our fixtures, the moat was always self-grading and we stop claiming it externally.

**10. Reliability-as-Insurance — underwrite the fruit** `REVENUE`
Once verification is adversary-resistant (#5/#7) and reliability is measured (#2), sell an SLA: if a clean fruit fails in the buyer's production, Mycelium credits or re-cultivates it — pricing risk only a vendor with real pass^k data can underwrite.
*Seed:* Composes Verified-Deliverable Pricing [23/40] + the locked baseline [19/40]; cost-tracker [5] sets the margin that funds the guarantee. CRO + CISO + CPO converge.
*Override:* No standalone card — synthesized from the two highest-converged revenue/science threads. Myth horizon because underwriting requires a large, trustworthy actuarial base of pass^k outcomes that only exists after years of #2+#4.
*Kill-experiment:* Offer a re-cultivate guarantee on one real cultivation and track claim rate. If claims exceed the cost-tracker margin, reliability isn't high enough to insure — the SLA bankrupts the product and we learn the true defect rate.

---

## THE THROUGH-LINE

The shift is **weakness-into-moat, executed in strict dependency order.** Mycelium's named weakness — no eval baseline, a fan-out masquerading as an organism, a self-attested "done" signal — is not a list of features to add; it is a single causal chain. You cannot honestly bill per clean fruit (#5, the top score) until "clean" is adversary-resistant (#7); you cannot prove verification improved without a locked baseline (#2); you cannot lock a baseline without first confirming the metric isn't noise (#1); and you cannot defend the number externally without admitting what you can't control (#3) and, eventually, a neutral judge (#9). Every high-score, low-feasibility moonshot in this pool was a *revenue* claim resting on an *unbuilt measurement substrate* — so the roadmap inverts the scoreboard: the cheap, unglamorous science items earn the right for the expensive, obvious revenue items to exist. The moat is not "we have a recursive engine" (copyable) — it is "we have the only reproducible, honestly-attributed reliability number on real cultivations, and we price against it." That is the one thing a competitor with zero reliability data structurally cannot match.

## If we only did three:

1. **#1 Noise-Band Probe** — an afternoon that tells us whether the entire thesis is real before we spend a quarter on it. Cheapest falsifier first.
2. **#2 Baseline Lock** — the substrate. It races the Router change at cultivate.ts:480, so it is both urgent and foundational; everything downstream (corpus, mesh, pricing) stacks on the attribution it enables.
3. **#5 Verified-Deliverable Pricing** — the business model the other two earn the right to ship. It is the highest-scoring idea (23/40) and the commercial payoff of the whole chain.

**How they compose:** #1 proves the signal exists → #2 turns the signal into a locked, attributable number → #5 turns that number into the invoice line. Probe, then measure, then monetize — in that order, never reversed. Run them out of order and you sell a meter you can't trust against a baseline you never locked on a signal that might be noise.
