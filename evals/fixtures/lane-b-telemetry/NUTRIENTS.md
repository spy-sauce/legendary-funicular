# NUTRIENTS — lane-b-telemetry

> Mycelium Framework — VibeSpace LLC — The network provides.
> Eval fixture — frozen stub. Do not extend.

## 1. Event envelope contract — FROZEN

Every telemetry line is a single JSON object appended to a JSONL file (one
object per line, `\n`-terminated). The envelope:

```json
{
  "event": "<kind>",
  "t": "<ISO-8601 timestamp with milliseconds>",
  "run_id": "<stable id, generated once per run>",
  "data": { }
}
```

| Field | Type | Constraint |
|---|---|---|
| `event` | string | One of the frozen kinds below |
| `t` | string | ISO-8601 with milliseconds, emit-time |
| `run_id` | string | Generated once per run, identical on every line |
| `data` | object | Kind-specific payload; may be `{}` |

### Frozen event kinds

Mirrors the framework's lifecycle kinds (see
`cli/src/lib/telemetry/events.ts` — the real framework envelope is
`{v, run_id, organism, ts, kind, data}`; this fixture uses the simplified
`{event, t, run_id, data}` shape so the leaf's output stays framework-free):

```
run_started · leaf_started · leaf_fruited · leaf_failed · cost_recorded
```

## 2. Sink contract — FROZEN

- Append-only. `emit` never truncates or rewrites earlier lines.
- `emit` never throws to the caller.
