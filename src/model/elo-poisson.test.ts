import { describe, it, expect } from "vitest";
import { EloPoissonModel } from "./elo-poisson";
import { mulberry32 } from "../domain/rng";

const ratings = new Map([
  ["STR", 2000],
  ["AVG", 1800],
  ["WEAK", 1600],
]);

describe("EloPoissonModel — strength model", () => {
  const model = new EloPoissonModel(ratings, { homeAdvantage: 0 });

  it("returns a valid probability distribution", () => {
    const o = model.matchOutcome("STR", "WEAK");
    const sum = o.pHome + o.pDraw + o.pAway;
    expect(sum).toBeGreaterThan(0.999);
    expect(sum).toBeLessThanOrEqual(1.0000001);
  });

  it("is monotone in rating gap", () => {
    expect(model.matchOutcome("STR", "WEAK").pHome).toBeGreaterThan(
      model.matchOutcome("STR", "AVG").pHome,
    );
  });

  it("treats equal ratings as symmetric when neutral", () => {
    const o = model.matchOutcome("AVG", "AVG");
    expect(o.pHome).toBeCloseTo(o.pAway, 6);
  });

  it("applies home advantage when configured", () => {
    const homeModel = new EloPoissonModel(ratings, { homeAdvantage: 100 });
    const o = homeModel.matchOutcome("AVG", "AVG");
    expect(o.pHome).toBeGreaterThan(o.pAway);
  });

  it("sampleScore is deterministic for a given seed and yields non-negative integers", () => {
    const s1 = model.sampleScore("STR", "WEAK", mulberry32(7));
    const s2 = model.sampleScore("STR", "WEAK", mulberry32(7));
    expect(s1).toEqual(s2);
    expect(Number.isInteger(s1.home)).toBe(true);
    expect(s1.home).toBeGreaterThanOrEqual(0);
    expect(s1.away).toBeGreaterThanOrEqual(0);
  });

  it("sampled win frequency tracks the analytical probability (statistical)", () => {
    const rng = mulberry32(2026);
    let homeWins = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const s = model.sampleScore("STR", "WEAK", rng);
      if (s.home > s.away) homeWins += 1;
    }
    const expected = model.matchOutcome("STR", "WEAK").pHome;
    expect(homeWins / N).toBeCloseTo(expected, 1); // within ~0.05
  });

  it("throws on an unknown team rather than guessing a rating", () => {
    expect(() => model.matchOutcome("STR", "NOPE")).toThrow();
  });
});
