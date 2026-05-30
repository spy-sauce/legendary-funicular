import { describe, it, expect } from "vitest";
import { rollupMetrics, scanReReads } from "./metrics.js";
import type { MicroCallRecord } from "./types.js";

const rec = (o: Partial<MicroCallRecord>): MicroCallRecord => ({
  tester_id: "t", sub_job_id: "s", cache_status: "miss", model: "haiku",
  input_tokens: 0, output_tokens: 0, raw_target_bytes: 0, ...o,
});

describe("rollupMetrics", () => {
  it("computes rates and sums; guards divide-by-zero", () => {
    const recs = [
      rec({ cache_status: "miss", input_tokens: 100, output_tokens: 40, raw_target_bytes: 800 }),
      rec({ cache_status: "hit" }),
    ];
    const m = rollupMetrics({ records: recs, micrsEnabled: true, foldedTargets: ["a", "b"], redundantReReads: 1, summaryInputTokens: 40, rawTargetBytes: 800 });
    expect(m.total_calls).toBe(2);
    expect(m.cache_hits).toBe(1);
    expect(m.cache_misses).toBe(1);
    expect(m.dedup_rate).toBeCloseTo(0.5);
    expect(m.haiku_input_tokens).toBe(100);
    expect(m.folded_targets).toBe(2);
    expect(m.re_read_rate).toBeCloseTo(0.5);
    expect(m.compression_ratio).toBeCloseTo(40 / 800);
  });

  it("returns zeroed rates for an empty pool (no divide-by-zero)", () => {
    const m = rollupMetrics({ records: [], micrsEnabled: false, foldedTargets: [], redundantReReads: 0, summaryInputTokens: 0, rawTargetBytes: 0 });
    expect(m.dedup_rate).toBe(0);
    expect(m.re_read_rate).toBe(0);
    expect(m.compression_ratio).toBe(0);
    expect(m.micros_enabled).toBe(false);
  });
});

describe("scanReReads", () => {
  it("counts folded targets the tester re-read via Read", () => {
    const stdout = [
      `[TOOL_USE] Read: {"file_path":"/cult/NUTRIENTS.md"}`,
      `[TOOL_USE] Bash: {"command":"ls"}`,
      `[TOOL_USE] Read: {"file_path":"/cult/src/App.tsx"}`,
    ].join("\n");
    expect(scanReReads(stdout, ["NUTRIENTS.md", "src/Other.tsx"])).toBe(1);
  });

  it("returns 0 when nothing folded", () => {
    expect(scanReReads("[TOOL_USE] Read: {...}", [])).toBe(0);
  });
});
