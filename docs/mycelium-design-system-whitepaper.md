# The Mycelium Design System
### A Whitepaper on Biological Vocabulary as Software Architecture

**VibeSpace LLC — Space Cowboy #9**
*"The network provides."*

Patent-pending. Status: living document. Companion to `MANIFESTO.md`, `ARCHITECTURE.md`, `spec/`.

---

## 1. Thesis

Most multi-agent frameworks fail not at the runtime layer but at the **vocabulary layer**. Teams adopt "agents," "tasks," "queues," and "workers" — the same nouns they use for industrial scheduling — and then discover the abstractions don't bend. An agent isn't a worker. A cultivation isn't a sprint. A contract isn't a ticket.

Mycelium proposes that the right primitives for distributed AI orchestration are **biological**, not industrial. Forests are the closest natural analog we have to what a healthy multi-agent system actually behaves like: many specialized nodes, no central controller, shared chemical signals, resources that flow toward need, lifecycles that include dormancy, and an organism-level outcome that no individual node can author alone.

This whitepaper defines the conceptual design system that flows from that thesis. It is the language layer underneath the CLI, the dashboard, the embeddings, and the CI/CD pipeline. Frozen vocabulary, frozen lifecycle, and frozen laws — composable everywhere else.

---

## 2. Design principles

The design system rests on five principles. They are normative — every primitive below either obeys them or it doesn't ship.

1. **Name from the domain, not the implementation.** A `HYPHA` is not "a worker subprocess." It is the strand. The implementation is allowed to change; the strand is not.
2. **Lifecycle over status.** Status is a flag; lifecycle is a story. Every node moves through a fixed sequence of states with biological semantics, and the system reads those states the same way a forester reads a tree.
3. **Contracts as chemistry.** Interfaces between nodes are chemical signals — small, typed, broadcast. No node imports another's internals. The shared `NUTRIENTS.md` is the only legal vector for cross-node data.
4. **Flow over ownership.** A node that finishes its scope does not idle. It looks for a blocked sibling and offers itself as nutrient. Ownership is a starting condition, not a fence.
5. **The organism is the unit of shipping.** Six leaves completing six tasks is not success. One organism producing one fruiting body is.

These are restated as the Five Laws in `MANIFESTO.md`. They are the same five.

---

## 3. The frozen vocabulary

Every term below is normative. Implementations may extend, but may not redefine.

| Term | Meaning | Implementation surface |
|---|---|---|
| **HYPHA** | A single strand of the network — one agent's scope and contract. | `hyphae/HYPHA-<BIOME>-AGENT.md` |
| **HYPHAE** | The collection of strands that compose a cultivation. | `hyphae/` directory |
| **NUTRIENTS** | Frozen contracts that flow between strands. The shared chemistry. | `NUTRIENTS.md` |
| **BIOME BUS** | The mesh on which signals travel. Decentralized — no central node. | event JSONL + routing membrane |
| **FRUITING BODY** | The deliverable. The visible output the organism produces. | committed code, dashboard, artifact |
| **SPORULATION** | Emission of reusable spores — patterns, modules, learnings — for the next cycle. | upgrades, templates, distilled context |
| **PRUNING** | Removing dead or low-value branches. Necessary for organism health. | failed-leaf cleanup, biome retirement |
| **HPP** | Hypha Productivity Protocol — the rhythm a strand keeps. | leaf schedule + cadence rules |
| **NFA** | Nutrient Flow Agreement — what one strand promises to deliver to another. | NUTRIENTS sections |

These nine terms are the entire conceptual surface. Anything you can build in Mycelium can be described using them. If a new feature requires a tenth term, that is a signal to redesign the feature, not the vocabulary.

---

## 4. The lifecycle

Every strand moves through six states. The transition graph is closed — a strand cannot enter a state that is not on this path.

```
SPORE → GERMINATING → GROWING → FLOWING → FRUITING → DORMANT
  ↑                                                     │
  └─────────────────────────────────────────────────────┘
```

- **SPORE** — Defined but not yet activated. Exists in `mycelium.yaml`; has not read its HYPHA.
- **GERMINATING** — Reading contracts, sensing network state. Law 1 ("Sense Before You Act") executes here.
- **GROWING** — Executing primary scope. The work the strand was planted to do.
- **FLOWING** — Primary work complete; the strand is now a nutrient source for blocked siblings. Law 2.
- **FRUITING** — Producing deliverables. The visible output is being staged.
- **DORMANT** — Idle, awaiting the next cycle. Spores from this cycle are emitted on entry.

The lifecycle is rendered identically in the CLI logs, the dashboard, the JSONL event stream, and the conceptual diagrams. One lifecycle, many surfaces.

---

## 5. The signal set

Strands do not call each other. They broadcast on the BIOME BUS. The signal vocabulary is small and closed:

| Signal | Meaning |
|---|---|
| `HEALTH_PULSE` | Periodic heartbeat with state + progress |
| `NUTRIENT_OFFER` | "My lane is clear, I can help with X" |
| `NUTRIENT_REQUEST` | "I'm blocked on Y, need support" |
| `CONTRACT_UPDATE` | A NUTRIENTS section changed — orchestrator-only |
| `FRUIT_READY` | Deliverable complete, ready for harvest |
| `MERGE_SIGNAL` | Ready to merge in deterministic order |

No private channels. No point-to-point RPC. If two strands need to coordinate, they do it through a frozen NUTRIENTS section and these six signals. This is what makes the network decentralized: a strand can be replaced, retried, or relocated without any sibling needing to know.

---

## 6. Composition: the three-layer model

The vocabulary above defines *what* a Mycelium system is made of. The architecture defines *how* the layers compose. There are exactly three:

```
┌───────────────────────────────────────────────┐
│  Claude Operator Layer                        │
│  Decision intelligence — reasons about        │
│  failures, costs, health. Natural language.   │
├───────────────────────────────────────────────┤
│  Framework Execution Layer                    │
│  Parallelism, reproducibility, audit trail.   │
│  Owns the lifecycle. Emits the events.        │
├───────────────────────────────────────────────┤
│  DDP CI/CD Pipeline                           │
│  8-stage gate from merge-order to prod.       │
│  Honors the FRUITING_BODY contract.           │
└───────────────────────────────────────────────┘
```

Each layer is bound to the vocabulary above. The Operator reads `HEALTH_PULSE` and `FRUIT_READY`. The Execution layer drives the lifecycle. The DDP pipeline gates the fruiting body. None of the layers tries to do another's job — they compose by sharing the same nouns.

---

## 7. Molding: the theme.yaml mechanism

The biological vocabulary is **frozen**. The visual and semantic projection of that vocabulary into a specific cultivation is **molded** through `theme.yaml`.

A theme defines:
- The palette and brand of the fruiting body
- The mapping from biome → identity color and node type
- Lifecycle colors (GERMINATING through DORMANT)
- The network visualization parameters

This means a single dashboard surface can render a Bloom cultivation, a LiveGrid cultivation, and an internal framework cultivation without any conceptual change — only molding change. The HYPHA is still a HYPHA. The FRUITING_BODY is still a FRUITING_BODY. The colors and the logo change.

This is the deliberate separation between **invariant biology** and **variant skin**. The biology is the design system. The skin is per-cultivation expression.

---

## 8. What this design system refuses

Equally important to what the system contains is what it explicitly refuses:

- **No org-chart abstractions.** Strands do not have managers. There is no "lead agent." There is no escalation path.
- **No private state.** A strand that holds context another strand cannot read has violated Law 3.
- **No silent failure.** A strand that hides degradation has violated Law 4. Broadcast is mandatory.
- **No task completion as success.** A green leaf in a brown organism is still failure. The organism is the unit.
- **No new vocabulary without redesign.** If a feature seems to require a new noun, the feature is wrong — not the vocabulary.

These refusals are what keep the system coherent as it scales from a 7-biome cultivation to a 50-biome one.

---

## 9. Why biology, not industry

The conventional vocabulary of distributed systems — workers, queues, jobs, tasks — comes from Taylorist industrial scheduling. It assumes interchangeable units, central dispatch, and completion-as-success. Multi-agent AI systems exhibit none of those properties. Agents are specialized, dispatch is decentralized, and completion of an individual task can coexist with organism-level failure.

Biology gives us a vocabulary that already encodes the properties we need:

- **Specialization without isolation** — every cell has a role, but the tissue heals collectively.
- **Lifecycle that includes rest** — dormancy is not failure; it is preparation.
- **Chemistry as protocol** — signals are typed, broadcast, and require no shared implementation.
- **Flow toward need** — nutrients move down concentration gradients without a scheduler.
- **The organism as the unit of fitness** — natural selection operates on organisms, not on cells.

Adopting the biological vocabulary is not metaphor. It is the assertion that the systems we are building are more like forests than like factories, and the language should reflect that.

---

## 10. Status and evolution

This design system is patent-pending and under active cultivation by its own framework. Changes to the frozen vocabulary require explicit redesign — they do not happen through pull requests. Changes to the molding mechanism, the surfaces, the signal payloads, and the implementations happen continuously and through the normal cultivation flow.

The design system itself is a HYPHA. It germinated, it has grown, it currently flows, and it will fruit through every cultivation that adopts it.

The network provides.

---

*Created by Space Cowboy #9 — VibeSpace LLC. "Here for a long time and a good time."* 🍄
