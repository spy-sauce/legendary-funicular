# HYPHA — lane-b-telemetry leaf

> Mycelium Framework — VibeSpace LLC — The network provides.
> Eval fixture: a real code-writing task with a frozen envelope contract.

## Scope

Write exactly **one** file: `telemetry-emitter.ts`, in the current working
directory. It must be **self-contained plain TypeScript**:

- No imports from any framework, package, or path other than the Node
  standard library (`node:fs`, `node:path`, `node:crypto` are fine).
- No `package.json`, no `tsconfig.json`, no other files.

## Required behavior

Implement and export an `emit(event)` function that appends **one JSONL line
per call** (JSON object + `\n`) to an events file, where each line is the
envelope defined in NUTRIENTS.md §1:

```json
{ "event": "leaf_started", "t": "2026-07-02T18:30:00.000Z", "run_id": "eval-...", "data": { } }
```

Requirements:

1. Define the event-kind names as a TypeScript union or constant list. It
   must include at least: `run_started`, `leaf_started`, `leaf_fruited`,
   `leaf_failed`, `cost_recorded`.
2. `emit(event)` serializes with `JSON.stringify` and **appends** — never
   truncates — so repeated calls build up a JSONL log.
3. `t` is an ISO-8601 timestamp with milliseconds, generated at emit time.
4. `run_id` is generated once per process (module scope is fine) and reused
   on every line.
5. Type the envelope (an interface for the `{event, t, run_id, data}` shape).
6. Never throw from `emit` — a telemetry failure must not kill the caller.
   Catch and swallow (or log to stderr) internally.

## Rules

- One file only. Do not run git. Do not install anything.
- Substance matters: a faithful implementation of the above (types, run_id
  generation, append sink, error guard) will naturally be 40+ lines.

## KPI gates

- Event-kind names from NUTRIENTS §1 appear in the source.
- `JSON.stringify` used for serialization.
- `telemetry-emitter.ts` is at least 40 lines.
