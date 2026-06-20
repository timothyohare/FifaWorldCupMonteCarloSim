import { describe, it, expect } from "vitest";
import { runDemo } from "./s5-perf-rng";
import { mulberry32 } from "./domain";

describe("S5 — performance + RNG determinism", () => {
  it("seeded RNG is bit-stable for a fixed seed and differs across seeds", () => {
    const d = runDemo(200_000); // small workload — this test is about correctness, not timing
    expect(d.rngDeterministic).toBe(true);
    expect(d.rngDiffersAcrossSeed).toBe(true);
  });

  it("mulberry32 yields an identical stream for the same seed (reproducibility)", () => {
    const first = Array.from({ length: 5 }, mulberry32(12345));
    const again = Array.from({ length: 5 }, mulberry32(12345));
    expect(again).toEqual(first);
    // All values are valid uniforms in [0, 1).
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("projects a finite 100k-sim runtime", () => {
    const d = runDemo(200_000);
    expect(d.projected100kSeconds).toBeGreaterThan(0);
    expect(Number.isFinite(d.projected100kSeconds)).toBe(true);
  });
});
