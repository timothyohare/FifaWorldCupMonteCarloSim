import { describe, it, expect } from "vitest";
import { flat, strengthWeighted, twoStage, runDemo } from "./s1-knockout-draw";

describe("S1 — knockout draw resolution", () => {
  it("for a favourite, flat < two-stage < strength-weighted", () => {
    const f = flat(1900, 1750);
    const t = twoStage(1900, 1750);
    const s = strengthWeighted(1900, 1750);
    expect(f).toBeLessThan(t);
    expect(t).toBeLessThan(s);
  });

  it("each resolver is symmetric: P(A) + P(B) = 1", () => {
    // two-stage sums to ~1 minus the Poisson grid's truncated tail (≈1e-6), so 5 digits.
    for (const r of [flat, strengthWeighted, twoStage]) {
      expect(r(1900, 1750) + r(1750, 1900)).toBeCloseTo(1, 5);
    }
  });

  it("the choice compounds — champion-over-4-rounds spread is large", () => {
    const d = runDemo();
    // Strength-weighted roughly doubles flat's champion odds for a Δ=150 side.
    expect(d.champion4.strengthWeighted).toBeGreaterThan(d.champion4.twoStage);
    expect(d.champion4.twoStage).toBeGreaterThan(d.champion4.flat);
  });
});
