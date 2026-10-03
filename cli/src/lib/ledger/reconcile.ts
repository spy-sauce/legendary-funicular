// Mycelium Framework — VibeSpace LLC — The network provides.
//
// ledger/reconcile.ts — PURE cross-check logic (no I/O). Given the three
// already-loaded truth stores (telemetry events, state.json, and a map of
// per-leaf git truth), produce the LedgerReport.
//
// Authoritative source per field (decided, not casual):
//   - commit SHA            ← state.json leaf.commit   (leaf_fruited.commit_sha
//                             is hardcoded null upstream — never used here)
//   - file count (truth)    ← git show --name-only     (files_produced = claim)
//   - cost / tokens         ← telemetry cost_recorded  (missing = the B20 class)
//   - integration           ← git merge-base --is-ancestor
//
// Join key is leaf_id across ALL stores. We iterate the UNION of leaf ids seen
// in state.json and in telemetry leaf events, so a leaf present in one store
// but not the other surfaces as a run-level leaf-count mismatch.

import type {
  LedgerEvent,
  LedgerState,
  LedgerLeafState,
  GitLeafTruth,
  Discrepancy,
  LeafLedgerEntry,
  LedgerReport,
  LedgerAvailability,
  DiscrepancySeverity,
} from "./types.js";

const SEVERITY_RANK: Record<DiscrepancySeverity, number> = {
  info: 0,
  warn: 1,
  critical: 2,
};

interface LeafTelemetry {
  started: boolean;
  fruited: boolean;
  failed: boolean;
  /** wall_ms from leaf_fruited/leaf_failed (last seen). */
  wall_ms: number | null;
  files_written: number | null;
  cost_usd: number | null;
  input_tokens: number;
  output_tokens: number;
  cost_events: number;
}

function emptyLeafTelemetry(): LeafTelemetry {
  return {
    started: false,
    fruited: false,
    failed: false,
    wall_ms: null,
    files_written: null,
    cost_usd: null,
    input_tokens: 0,
    output_tokens: 0,
    cost_events: 0,
  };
}

/** Index telemetry events by leaf id. */
function indexTelemetry(events: LedgerEvent[]): Map<string, LeafTelemetry> {
  const byLeaf = new Map<string, LeafTelemetry>();
  const get = (id: string): LeafTelemetry => {
    let t = byLeaf.get(id);
    if (!t) {
      t = emptyLeafTelemetry();
      byLeaf.set(id, t);
    }
    return t;
  };

  for (const ev of events) {
    const d = ev.data ?? {};
    const leafId: string | undefined = d.leaf_id;
    switch (ev.kind) {
      case "leaf_started":
        if (leafId) get(leafId).started = true;
        break;
      case "leaf_fruited":
        if (leafId) {
          const t = get(leafId);
          t.fruited = true;
          if (typeof d.wall_ms === "number") t.wall_ms = d.wall_ms;
          if (typeof d.files_written === "number")
            t.files_written = d.files_written;
        }
        break;
      case "leaf_failed":
        if (leafId) {
          const t = get(leafId);
          t.failed = true;
          if (typeof d.wall_ms === "number") t.wall_ms = d.wall_ms;
        }
        break;
      case "cost_recorded":
        if (leafId) {
          const t = get(leafId);
          t.cost_events += 1;
          if (typeof d.usd_estimate === "number")
            t.cost_usd = (t.cost_usd ?? 0) + d.usd_estimate;
          if (typeof d.input_tokens === "number")
            t.input_tokens += d.input_tokens;
          if (typeof d.output_tokens === "number")
            t.output_tokens += d.output_tokens;
        }
        break;
    }
  }

  return byLeaf;
}

function worstSeverity(
  discs: Discrepancy[]
): DiscrepancySeverity | null {
  let worst: DiscrepancySeverity | null = null;
  for (const d of discs) {
    if (worst === null || SEVERITY_RANK[d.severity] > SEVERITY_RANK[worst]) {
      worst = d.severity;
    }
  }
  return worst;
}

export interface ReconcileInput {
  runId: string | null;
  organism: string | null;
  eventLogPath: string | null;
  statePath: string | null;
  events: LedgerEvent[] | null;
  state: LedgerState | null;
  /** leafId → git truth; null when git checks were skipped entirely. */
  gitTruth: Map<string, GitLeafTruth> | null;
  availability: LedgerAvailability;
}

const DONE_STATES = new Set(["done", "conflicted"]);
const TERMINAL_STATES = new Set(["done", "failed", "conflicted"]);

export function reconcile(input: ReconcileInput): LedgerReport {
  const { events, state, gitTruth, availability } = input;
  const telemetry = indexTelemetry(events ?? []);

  const discrepancies: Discrepancy[] = [];
  const entries: LeafLedgerEntry[] = [];

  const stateLeaves: LedgerLeafState[] = state?.leaves ?? [];
  const stateLeafIds = new Set(stateLeaves.map((l) => l.id));

  // ── Per-leaf checks (driven by state.json — the CLAIMS side) ───────────
  for (const leaf of stateLeaves) {
    const perLeafDiscs: Discrepancy[] = [];
    const tel = telemetry.get(leaf.id) ?? emptyLeafTelemetry();
    const git = gitTruth?.get(leaf.id) ?? null;
    const status = leaf.status;
    const isDone = DONE_STATES.has(status);
    const filesClaimed =
      typeof leaf.files_produced === "number" ? leaf.files_produced : null;

    // status_mismatch (critical)
    if (status === "done" && tel.failed) {
      perLeafDiscs.push({
        severity: "critical",
        check: "status_mismatch",
        leaf: leaf.id,
        claimed: "state: done",
        observed: "telemetry: leaf_failed",
      });
    } else if (status === "failed" && tel.fruited && !tel.failed) {
      perLeafDiscs.push({
        severity: "critical",
        check: "status_mismatch",
        leaf: leaf.id,
        claimed: "state: failed",
        observed: "telemetry: leaf_fruited",
      });
    } else if (
      status === "done" &&
      availability.telemetry &&
      tel.started &&
      !tel.fruited
    ) {
      // Only assert this when telemetry is present AND this leaf appears in it
      // (tel.started) — otherwise a clean-local run with no run_ended would
      // false-positive every done leaf.
      perLeafDiscs.push({
        severity: "critical",
        check: "status_mismatch",
        leaf: leaf.id,
        claimed: "state: done",
        observed: "telemetry: no leaf_fruited event",
      });
    }

    // Commit-dependent checks — only when git ran.
    let filesActual: number | null = null;
    let integrated: boolean | null = null;
    if (git) {
      if (git.files) filesActual = git.files.length;
      integrated = git.is_ancestor;

      // phantom_commit (critical): claimed commit missing/unresolvable.
      if (leaf.commit && !git.commit_resolved) {
        perLeafDiscs.push({
          severity: "critical",
          check: "phantom_commit",
          leaf: leaf.id,
          claimed: `commit ${short(leaf.commit)}`,
          observed: "git: unresolvable / missing",
        });
      }

      // ghost_files (critical): done + files_produced>0 but 0 files committed
      // (or no commit at all for a done leaf).
      if (isDone && (filesClaimed ?? 0) > 0) {
        if (!leaf.commit) {
          perLeafDiscs.push({
            severity: "critical",
            check: "ghost_files",
            leaf: leaf.id,
            claimed: `${filesClaimed} file(s) produced`,
            observed: "git: no commit recorded",
          });
        } else if (git.commit_resolved && filesActual === 0) {
          perLeafDiscs.push({
            severity: "critical",
            check: "ghost_files",
            leaf: leaf.id,
            claimed: `${filesClaimed} file(s) produced`,
            observed: "git: commit touches 0 files",
          });
        }
      }

      // file_count_drift: claimed ≠ actual. git ≥ claimed → warn (Bash files
      // not in artifacts). git < claimed → critical (loud: claimed files not
      // in the commit). Only meaningful when the commit resolved with files.
      if (
        leaf.commit &&
        git.commit_resolved &&
        filesActual !== null &&
        filesClaimed !== null &&
        filesActual !== filesClaimed &&
        // ghost_files already covers the actual==0 case above.
        !(isDone && filesClaimed > 0 && filesActual === 0)
      ) {
        const under = filesActual < filesClaimed;
        perLeafDiscs.push({
          severity: under ? "critical" : "warn",
          check: "file_count_drift",
          leaf: leaf.id,
          claimed: `${filesClaimed} file(s)`,
          observed: `git: ${filesActual} file(s)`,
          note: under
            ? "git < claimed — claimed files absent from the commit"
            : "git > claimed — extra files (Bash-created, not in artifacts)",
        });
      }

      // not_integrated (critical): done + commit exists + resolves but NOT an
      // ancestor of HEAD, and the leaf is not marked conflicted. Silent loss.
      if (
        status === "done" &&
        leaf.commit &&
        git.commit_resolved &&
        git.is_ancestor === false
      ) {
        perLeafDiscs.push({
          severity: "critical",
          check: "not_integrated",
          leaf: leaf.id,
          claimed: "state: done",
          observed: `git: commit ${short(leaf.commit)} not an ancestor of HEAD`,
          note: "silent loss — done leaf whose commit never merged",
        });
      }
    }

    // conflicted_leaf (warn): surface it with its conflict files.
    if (status === "conflicted") {
      perLeafDiscs.push({
        severity: "warn",
        check: "conflicted_leaf",
        leaf: leaf.id,
        claimed: "state: conflicted",
        observed:
          leaf.conflict_files && leaf.conflict_files.length
            ? `colliding: ${leaf.conflict_files.join(", ")}`
            : "conflict on integration (no files listed)",
      });
    }

    // missing_cost (warn): leaf reached a terminal state but no cost_recorded
    // event for it. This is the B20 bug class — permanently visible now.
    if (availability.telemetry && TERMINAL_STATES.has(status)) {
      if (tel.cost_events === 0) {
        perLeafDiscs.push({
          severity: "warn",
          check: "missing_cost",
          leaf: leaf.id,
          claimed: `status: ${status}`,
          observed: "telemetry: no cost_recorded event",
          note: "B20 class — cost not attributed to this leaf",
        });
      }
    }

    // duration_drift (info): |telemetry wall_s − state duration| > 10%.
    if (
      typeof leaf.duration_seconds === "number" &&
      tel.wall_ms !== null &&
      leaf.duration_seconds > 0
    ) {
      const telSec = tel.wall_ms / 1000;
      const drift =
        Math.abs(telSec - leaf.duration_seconds) / leaf.duration_seconds;
      if (drift > 0.1) {
        perLeafDiscs.push({
          severity: "info",
          check: "duration_drift",
          leaf: leaf.id,
          claimed: `state: ${leaf.duration_seconds.toFixed(1)}s`,
          observed: `telemetry: ${telSec.toFixed(1)}s`,
          note: `${(drift * 100).toFixed(0)}% drift`,
        });
      }
    }

    for (const d of perLeafDiscs) discrepancies.push(d);

    entries.push({
      leaf: leaf.id,
      status,
      files_claimed: filesClaimed,
      files_actual: filesActual,
      commit_short: leaf.commit ? short(leaf.commit) : null,
      integrated,
      cost_usd: tel.cost_usd,
      duration_seconds:
        typeof leaf.duration_seconds === "number"
          ? leaf.duration_seconds
          : null,
      worst: worstSeverity(perLeafDiscs),
    });
  }

  // ── Run-level checks ────────────────────────────────────────────────────

  // Leaf-count mismatch across run_started.total_leaves / state.total /
  // observed leaf events (warn). Only compare the numbers we actually have.
  const runStarted = (events ?? []).find((e) => e.kind === "run_started");
  const declaredTotal =
    runStarted && typeof runStarted.data?.total_leaves === "number"
      ? (runStarted.data.total_leaves as number)
      : null;
  const stateTotal =
    typeof state?.total === "number" ? state.total : null;
  const observedLeafIds = new Set<string>();
  for (const [id, t] of telemetry) {
    if (t.started || t.fruited || t.failed) observedLeafIds.add(id);
  }
  const observedCount = observedLeafIds.size;

  const countCandidates: Array<{ label: string; n: number }> = [];
  if (declaredTotal !== null)
    countCandidates.push({ label: `run_started.total=${declaredTotal}`, n: declaredTotal });
  if (stateTotal !== null)
    countCandidates.push({ label: `state.total=${stateTotal}`, n: stateTotal });
  countCandidates.push({ label: `state.leaves=${stateLeaves.length}`, n: stateLeaves.length });
  if (availability.telemetry)
    countCandidates.push({ label: `telemetry leaves=${observedCount}`, n: observedCount });

  const distinct = new Set(countCandidates.map((c) => c.n));
  if (distinct.size > 1) {
    discrepancies.push({
      severity: "warn",
      check: "leaf_count_mismatch",
      leaf: "(run)",
      claimed: countCandidates.map((c) => c.label).join(" / "),
      observed: "counts disagree",
    });
  }

  // Leaf present in telemetry but absent from state.json → part of the same
  // mismatch story; note each distinctly as info so it's actionable.
  for (const id of observedLeafIds) {
    if (!stateLeafIds.has(id)) {
      discrepancies.push({
        severity: "warn",
        check: "leaf_count_mismatch",
        leaf: id,
        claimed: "state.json: absent",
        observed: "telemetry: leaf events present",
      });
    }
  }

  // missing run_ended (info) — expected on clean local runs.
  if (availability.telemetry) {
    const hasRunEnded = (events ?? []).some((e) => e.kind === "run_ended");
    if (!hasRunEnded) {
      discrepancies.push({
        severity: "info",
        check: "missing_run_ended",
        leaf: "(run)",
        claimed: "run_ended event",
        observed: "absent",
        note: "expected on clean local runs (only crash paths emit run_ended)",
      });
    }
  }

  // ── Totals ────────────────────────────────────────────────────────────
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;
  for (const [, t] of telemetry) {
    if (t.cost_usd !== null) totalCost += t.cost_usd;
    totalIn += t.input_tokens;
    totalOut += t.output_tokens;
  }

  // ── Roll-up ───────────────────────────────────────────────────────────
  const counts = { critical: 0, warn: 0, info: 0 };
  for (const d of discrepancies) counts[d.severity] += 1;

  const leavesOk = entries.filter(
    (e) => e.worst === null || e.worst === "info"
  ).length;

  const exit_code: 0 | 1 | 2 =
    counts.critical > 0 ? 1 : counts.warn > 0 ? 2 : 0;

  // Sort discrepancies critical→warn→info, run-level last within a tier is fine.
  discrepancies.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  );

  const when =
    (state?.started_at as string | undefined) ??
    (events && events.length ? events[0].ts : null);

  return {
    run_id: input.runId,
    organism: input.organism ?? state?.organism ?? null,
    when: when ?? null,
    event_log_path: input.eventLogPath,
    state_path: input.statePath,
    availability,
    leaves: entries,
    discrepancies,
    leaves_ok: leavesOk,
    leaves_total: entries.length,
    total_cost_usd: totalCost,
    total_input_tokens: totalIn,
    total_output_tokens: totalOut,
    counts,
    exit_code,
  };
}

function short(sha: string): string {
  return sha.slice(0, 8);
}
