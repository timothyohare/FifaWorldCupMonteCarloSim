import { describe, it, expect } from "vitest";
import { logLoss, brier, baselineLogLoss, type Sample } from "./scoring";

describe("eval/scoring", () => {
  it("perfect forecast → ~0 log loss; uniform → ln 3", () => {
    expect(logLoss([{ probs: [1, 0, 0], outcome: 0 }])).toBeCloseTo(0, 6);
    expect(baselineLogLoss([0, 1, 2])).toBeCloseTo(Math.log(3), 6);
  });

  it("rewards confident-correct over confident-wrong", () => {
    const right: Sample[] = [{ probs: [0.9, 0.05, 0.05], outcome: 0 }];
    const wrong: Sample[] = [{ probs: [0.9, 0.05, 0.05], outcome: 2 }];
    expect(logLoss(right)).toBeLessThan(logLoss(wrong));
  });

  it("Brier is 0 for a perfect forecast", () => {
    expect(brier([{ probs: [1, 0, 0], outcome: 0 }])).toBeCloseTo(0, 9);
  });
});
