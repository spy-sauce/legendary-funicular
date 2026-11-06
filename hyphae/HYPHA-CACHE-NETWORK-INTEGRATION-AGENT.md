# HYPHA — cache-network-integration

## CACHE HEADER
- **SCOPE:** Wire the `CacheStore` into `cultivate.ts` at the SDK-call chokepoint, expose `--no-cache`, hook iter-invalidate into heal-loop, schedule the `state.json` cache-block pulse writer.
- **PRIMITIVES:** `query()` wrap · `cacheKey()` derivation · `store.get`/`store.set` · `invalidateIter()` · `writeCachePulse()` · `--no-cache` Commander flag.
- **RULES:** preserve `cultivate.ts` public contract (flags / prompt shape / CommitQueue) — CLAUDE.md hard rule #2 · `--no-cache` is the ONLY new flag · no new files in this biome (integration only) · `--no-cache` path is pure passthrough (zero `cache.*` events) · clear pulse timer on cultivate exit.
- **COUPLING:** consumes `cache-network-store` exports (`makeCacheStore`, `cacheKey`, `CacheStore`) and `cache-network-store`'s `accounting.ts` (`emitCacheEvent`, `writeCachePulse`). Emits NUTRIENTS §3 events. Writes NUTRIENTS §5 cache block. No coupling to `cache-network-micros` (micros are spawned by leaves, not by integration).
- **LOAD WHEN:** wrapping the SDK call, adding `--no-cache`, hooking iter-advance, or scheduling the pulse aggregator.

## Scope
Modify `cli/src/commands/cultivate.ts` to wrap the `claude-agent-sdk` `query()` call with a cache-network lookup, add `--no-cache` to the `cultivate` Commander surface, hook `store.invalidateIter` into the heal-loop iter-advance path, and schedule `writeCachePulse` on the 1.4s cadence. Integration-only — no new files. Lands after `cache-network-store` freezes its exports; can land in parallel with `cache-network-micros`.

## Deliverables by leaf

### `cache.integration.chokepoint-locate`
- LOCATE-ONLY leaf. Run `grep -n "query(" cli/src/commands/cultivate.ts` and `grep -n "claude-agent-sdk" cli/src/commands/cultivate.ts` to find the real anchor. At freeze time the call site is `cli/src/commands/cultivate.ts:487` (`stream = query({ prompt, options: { ... } })`), but the file may have drifted — record the actual line in the FRUIT_READY summary so downstream leaves edit against truth, not the spec.
- Do NOT modify code. Output is a one-line FRUIT_READY recording `<file>:<line>` and the surrounding 3-line context, written to leaf stdout.

### `cache.integration.wrap-sdk-call`
- At the located chokepoint in `cli/src/commands/cultivate.ts`, wrap the `stream = query({ ... })` call: derive `key = cacheKey({ tool_name: "claude-agent-sdk", args: prompt, contract_hash })`. Source `contract_hash` from cultivation context if available; fall back to the literal `"unfrozen"` if no contract hash exists at runtime.
- On `store.get(key)` hit: return the cached payload directly (the store emits `cache.hit` internally per NUTRIENTS §4) and skip the SDK call entirely.
- On miss: emit `cache.miss` via `emitCacheEvent` (NUTRIENTS §3), fall through to the existing `query()`/streaming path unchanged, then `store.set(key, payload, payload.usage?.input_tokens ?? 0, leaf.id, currentIter)` after the stream completes.
- Preserve the existing `activeSessions.add(stream)` bookkeeping and the `for await (const msg of stream)` loop. Only the entry-point is wrapped; downstream behavior is unchanged.

### `cache.integration.no-cache-flag`
- Add `.option("--no-cache", "skip cache-network wrapper", false)` to the `cultivate` Commander declaration (find the `program.command("cultivate")` block).
- When `opts.cache === false` (Commander inverts `--no-cache`), the wrapper short-circuits to pure passthrough: no `store.get`, no `store.set`, no `emitCacheEvent` calls. Zero `cache.*` lines in the JSONL stream is the acceptance signal.
- Default ON per NUTRIENTS §4.

### `cache.integration.iter-invalidate`
- Locate the heal-loop iter-advance path. Likely candidates: `cli/src/lib/audit/heal-iteration.ts` (search for `iter += 1`, `state.iter`, or `resetBiomeLeaves`) and `cli/src/commands/cultivate.ts` (search for `audit-state` writes). Read before write.
- Immediately before the iter increments from `prevIter` to `prevIter + 1`, call `store.invalidateIter(prevIter)`. Single one-line wiring change.
- Acceptance: `store.stats().entries` decreases by exactly the count of entries with `iter === prevIter`, and `cache.evict` events with `reason: "iter_invalidate"` appear in the JSONL stream.

### `cache.integration.state-json-pulse`
- Schedule `writeCachePulse(stateDir, store.stats())` on a `setInterval` at the 1.4s cadence matching NUTRIENTS §3 `cache.pulse` aggregation. Start the timer when cultivate seeds `sporenet/state.json` (alongside `ensureSporenetState` from the 2026-05-10 F3 fix).
- Register a cleanup that calls `clearInterval` on cultivate exit (both normal completion and the existing `activeSessions` cancellation path). Add to the same shutdown channel that already awaits `drainLeafStateWrites`.
- Acceptance: `state.json.cache` is populated within 1.5s of the first SDK call, refreshes every ~1.4s while cultivate runs, and the timer does not leak after `cultivate` returns.

## Contract dependencies
- NUTRIENTS §3 (cache event schema — emits `cache.hit` via `store.get`, `cache.miss` directly, `cache.pulse` via aggregator, `cache.evict` via `invalidateIter`).
- NUTRIENTS §4 (consumes `makeCacheStore`, `cacheKey`, `CacheStore` exports — must wait on `cache-network-store` merging first).
- NUTRIENTS §5 (writes the additive `cache` block via `writeCachePulse`; preserves existing `SporenetState` shape per `cli/src/commands/sporenet.ts:34-42`).

## Acceptance criteria
- `npx tsc --noEmit` clean.
- `cli/src/commands/cultivate.ts` public contract preserved — no renamed flags, no prompt-shape changes, no CommitQueue behavior change. `--no-cache` is the only new surface.
- Cultivation run with `--no-cache`: zero `cache.*` events in `.mycelium/events/<organism>.jsonl`.
- Cultivation run without `--no-cache`: `cache.hit`/`cache.miss` events on every SDK call; `cache.pulse` aggregate every ~1.4s; `cache.evict` on iter advance.
- `sporenet/state.json` shows a populated `cache` block after the first pulse and continues to refresh; existing fields unchanged.
- `store.stats().entries` drops on iter advance — entries with `iter === prevIter` are evicted before increment.

## Out of scope
- `makeCacheStore` / LRU eviction internals — `cache-network-store`.
- Micro-agent fan-out (`spawnMicros`) — `cache-network-micros`.
- Dashboard reads of `state.cache` — `dashboard-data`.
- `mycelium dashboard` CLI surface — `dashboard-cli`.
- Cache-network docs / design note publication — `cache-network-docs`.

## Merge instructions
Lands AFTER `cache-network-store` (depends on its exports). Can land in parallel with `cache-network-micros` (disjoint files). Touches `cli/src/commands/cultivate.ts` — the most sensitive file in the framework per CLAUDE.md hard rule #2. Public contract preservation is non-negotiable: `--no-cache` is the only new flag, prompt shape unchanged, CommitQueue behavior unchanged, existing flags unrenamed. If any sub-leaf finds the chokepoint has moved or the iter-advance path has been refactored, halt and emit FRUIT_FAILED with the discrepancy — do NOT improvise around contract drift.
