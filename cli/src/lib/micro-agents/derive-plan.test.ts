import { describe, it, expect } from "vitest";
import { derivePlan } from "./derive-plan.js";

describe("derivePlan", () => {
  it("returns one summarize sub-job per input, capped at the seeded count", () => {
    const plan = derivePlan("tester.schema", [
      "NUTRIENTS.md", "cli/src/x.ts", "cli/src/y.ts", "cli/src/z.ts", "cli/src/w.ts",
    ]);
    expect(plan.length).toBeGreaterThanOrEqual(2);
    expect(plan.length).toBeLessThanOrEqual(4);
    expect(plan.every((j) => j.kind === "summarize")).toBe(true);
    expect(plan.every((j) => typeof j.id === "string" && j.id.length > 0)).toBe(true);
  });

  it("is deterministic for the same tester id + inputs", () => {
    const a = derivePlan("tester.auth", ["a.ts", "b.ts", "c.ts"]);
    const b = derivePlan("tester.auth", ["a.ts", "b.ts", "c.ts"]);
    expect(a).toEqual(b);
  });

  it("returns empty plan when there are no inputs", () => {
    expect(derivePlan("tester.types", [])).toEqual([]);
  });

  it("never produces more sub-jobs than inputs", () => {
    const plan = derivePlan("tester.x", ["only-one.ts"]);
    expect(plan.length).toBe(1);
  });

  it("derives stable distinct slugs from targets", () => {
    const plan = derivePlan("tester.s", ["NUTRIENTS.md", "src/App.tsx"]);
    const ids = plan.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
