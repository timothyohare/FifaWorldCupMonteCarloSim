import { describe, it, expect } from "vitest";
import { logLoss, brier, reliability, asUniform, runDemo, UNIFORM, type Sample } from "./s8-backtest";

describe("S8 — backtest scoring harness", () => {
  it("log loss rewards confident-correct and punishes confident-wrong", () => {
    const confidentRight: Sample[] = [{ probs: [0.9, 0.05, 0.05], outcome: 0 }];
    const confidentWrong: Sample[] = [{ probs: [0.9, 0.05, 0.05], outcome: 2 }];
    expect(logLoss(confidentRight)).toBeLessThan(logLoss(confidentWrong));
  });

  it("a perfect predictor scores ~0 log loss; uniform scores ln(3)", () => {
    const perfect: Sample[] = [{ probs: [1, 0, 0], outcome: 0 }];
    expect(logLoss(perfect)).toBeCloseTo(0, 6);
    expect(logLoss(asUniform([0, 1, 2]))).toBeCloseTo(Math.log(3), 6);
  });

  it("Brier score is 0 for a perfect forecast", () => {
    expect(brier([{ probs: [1, 0, 0], outcome: 0 }])).toBeCloseTo(0, 9);
  });

  it("reliability bins partition the samples and aggregate", () => {
    const bins = reliability(
      [
        { probs: [0.8, 0.1, 0.1], outcome: 0 },
        { probs: [0.2, 0.4, 0.4], outcome: 1 },
      ],
      10,
    );
    const total = bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(2);
  });

  it("a calibrated predictor beats the coin-flip baseline (the C3 gate works)", () => {
    const d = runDemo(4000);
    expect(d.skilledBeatsBaseline).toBe(true);
    expect(d.baseline.logLoss).toBeCloseTo(Math.log(3), 2);
    expect(d.skilled.logLoss).toBeLessThan(d.baseline.logLoss);
  });

  it("UNIFORM is a proper distribution", () => {
    expect(UNIFORM.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});
