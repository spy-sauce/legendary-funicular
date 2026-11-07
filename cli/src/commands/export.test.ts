import { describe, it, expect } from "vitest";
import path from "node:path";
import { defaultExportDir, defaultScanRoots } from "./export.js";

describe("export defaults", () => {
  it("writes to ~/Desktop/mycelium-export by default", () => {
    expect(defaultExportDir("/home/op")).toBe(
      path.join("/home/op", "Desktop", "mycelium-export")
    );
  });

  it("scans the Desktop and siblings of the current directory", () => {
    const roots = defaultScanRoots("/home/op", "/work/repos/legendary-funicular");
    expect(roots).toContain(path.join("/home/op", "Desktop", "bardot"));
    expect(roots).toContain(path.join("/work/repos", "bloom-labs"));
    expect(roots).toContain(path.join("/work/repos", "legendary-funicular"));
  });

  it("has no machine-specific scan roots", () => {
    const roots = defaultScanRoots("/home/op", "/work/repos/x");
    for (const r of roots) {
      expect(r.startsWith("/home/op/Desktop/") || r.startsWith("/work/repos/")).toBe(true);
    }
  });

  it("dedupes when cwd is on the Desktop", () => {
    const roots = defaultScanRoots("/home/op", "/home/op/Desktop/bardot");
    expect(new Set(roots).size).toBe(roots.length);
    expect(roots).toHaveLength(3);
  });
});
