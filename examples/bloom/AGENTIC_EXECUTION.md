# Bloom — Agentic Execution Reference

> Mycelium Framework — VibeSpace LLC — The network provides.

This document shows how the Bloom project uses Mycelium's agentic execution
model to ship a complete product in 7 days with 6 parallel agents.

---

## The Organism

**Bloom** is a link-in-bio platform. Six agents work as nodes in a mycelium
network, each owning a domain but connected through shared contracts.

## Agent Map

```
  ┌──────────────┐     ┌──────────────┐
  │ Pipeline 🔧   │     │ Frontend 🎨   │
  │ CI/CD + Infra │     │ UI + Landing  │
  │ blocks: none  │     │ needs: auth   │
  └──────┬───────┘     └──────┬───────┘
         │                     │
         │              ┌──────┴───────┐
         │              │   Auth 🔐     │
         │              │ JWT + Signup  │
         │              │ blocks: ident │
         │              │         front │
         │              └──────┬───────┘
         │                     │
         │              ┌──────┴───────┐
         │              │ Identity 👤   │
         │              │ Handles/Prof  │
         │              │ blocks: cards │
         │              └──────┬───────┘
         │                     │
  ┌──────┴───────┐     ┌──────┴───────┐
  │ Redirect 🔀   │     │  Cards 🃏     │
  │ Vanity URLs   │     │ Public Prof   │
  │ blocks: cards │     │ needs: ident  │
  └──────────────┘     │         rdir  │
                       └──────────────┘
```

## Shared Contracts (Chemical Signals)

These are frozen before sprint begins:

| Contract | Owner | Consumers |
|----------|-------|-----------|
| `user-entity` | auth-agent | identity, cards, frontend |
| `jwt-claims` | auth-agent | all agents |
| `error-response` | pipeline-agent | all agents |
| `public-card` | card-agent | frontend, redirect |

## Execution Timeline

### Phase 1: Germination (Hours 0-2)
```
[AGENT-1:PIPE] 🌱 Scaffolding CI/CD pipeline | 🔄 available | network healthy
[AGENT-2:AUTH] 🌱 Reading contracts, setting up JWT | 🔄 available | network healthy
[AGENT-6:FRONT] 🌱 Scaffolding React app + routing | 🔄 available | network healthy
```

Three agents germinate in parallel. Pipeline, Auth, and Frontend have no blockers.

### Phase 2: Full Growth (Hours 2-6)
```
[AGENT-1:PIPE] 🌿 Docker + GitHub Actions live | 🔄 flowing to Auth | network healthy
[AGENT-2:AUTH] 🌿 Signup + JWT + middleware done | 🔄 available | network healthy
[AGENT-3:IDENT] 🌱 Germinating — absorbing user-entity contract | network healthy
[AGENT-4:RDIR] 🌱 Germinating — setting up Redis + GeoIP | network healthy
[AGENT-6:FRONT] 🌿 Landing page + auth forms built | 🔄 available | network healthy
```

Pipeline finishes early and **flows nutrients** to help Auth with integration tests.
Identity and Redirect agents germinate as their dependencies become available.

### Phase 3: Integration (Hours 6-12)
```
[AGENT-2:AUTH] 🍄 Auth service complete — fruit ready | network healthy
[AGENT-3:IDENT] 🌿 Profiles + avatars growing | 🔄 available | network healthy
[AGENT-4:RDIR] 🌿 Vanity URLs + analytics growing | 🔄 available | network healthy
[AGENT-5:CARD] 🌱 Germinating — absorbing identity + redirect contracts | network healthy
[AGENT-6:FRONT] 🌿 Integrating auth flows | 🔄 available | network healthy
```

Auth **fruits** (produces its deliverable). Card agent germinates once Identity
and Redirect reach GROWING state. The organism is converging.

### Phase 4: Fruiting (Hours 12-24)
```
[AGENT-3:IDENT] 🍄 Identity service complete | network healthy
[AGENT-4:RDIR] 🍄 Redirect service complete | network healthy
[AGENT-5:CARD] 🌿 Building public cards with live data | network healthy
[AGENT-6:FRONT] 🌿 Final integration + polish | network healthy
```

### Phase 5: Harvest
```
[ORCHESTRATOR] 🍄 Organism health: 0.95 — initiating harvest
[ORCHESTRATOR] Merge order: pipeline → auth → identity → redirect → cards → frontend
[ORCHESTRATOR] All agents FRUITING or DORMANT
[ORCHESTRATOR] ✅ Harvest complete — Bloom ships
```

## Nutrient Flow Log

| Time | From | To | Contribution |
|------|------|----|-------------|
| H2 | pipeline-agent | auth-agent | Integration tests for JWT |
| H4 | auth-agent | identity-agent | User entity validation helpers |
| H6 | pipeline-agent | redirect-agent | Redis caching setup |
| H8 | frontend-agent | card-agent | CSS component library |
| H10 | auth-agent | frontend-agent | Auth hook debugging |

This is the power of Mycelium: **no agent ever clocked out**. When their lane
was clear, they became nutrients for the organism.

## Results

- 6 agents, 7 days, 1 organism
- Zero idle time — every agent either GROWING, FLOWING, or FRUITING
- 5 nutrient flows — self-organized, no manager required
- Deterministic merge order — no integration chaos

---

*The network provides.* 🍄
