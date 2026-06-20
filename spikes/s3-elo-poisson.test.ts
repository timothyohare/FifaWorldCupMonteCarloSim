import { describe, it, expect } from "vitest";
import { eloExpectation, eloToLambdas, matchOutcome, ratingsToOutcome } from "./s3-elo-poisson";

describe("S3 — Elo → Poisson strength model", () => {
  it("Elo expectation is 0.5 for equal ratings and ~0.91 for a 400-point edge", () => {
    expect(eloExpectation(1800, 1800)).toBeCloseTo(0.5, 6);
    expect(eloExpectation(2200, 1800)).toBeCloseTo(0.909, 2);
  });

  it("probabilities form a valid distribution that sums to ~1", () => {
    const o = ratingsToOutcome(1900, 1750);
    const sum = o.pHome + o.pDraw + o.pAway;
    expect(sum).toBeGreaterThan(0.999);
    expect(sum).toBeLessThanOrEqual(1.0000001);
  });

  it("is monotone: a bigger rating edge ⇒ a higher home win probability", () => {
    const small = ratingsToOutcome(1820, 1800).pHome;
    const big = ratingsToOutcome(2200, 1800).pHome;
    expect(big).toBeGreaterThan(small);
  });

  it("equal ratings still favour home slightly (home advantage) and leave real draw mass", () => {
    const o = ratingsToOutcome(1800, 1800);
    expect(o.pHome).toBeGreaterThan(o.pAway);
    expect(o.pDraw).toBeGreaterThan(0.2); // double-Poisson keeps draws plausible
  });

  it("λ mapping is symmetric under swapping sides (ignoring home advantage)", () => {
    const a = eloToLambdas(1900, 1750, { homeAdv: 0 });
    const b = eloToLambdas(1750, 1900, { homeAdv: 0 });
    expect(a.home).toBeCloseTo(b.away, 6);
    expect(a.away).toBeCloseTo(b.home, 6);
  });

  it("a strong favourite (Δ=300) lands in a believable band, not a certainty", () => {
    const o = matchOutcome(eloToLambdas(2100, 1800));
    expect(o.pHome).toBeGreaterThan(0.55);
    expect(o.pHome).toBeLessThan(0.85); // football is noisy; no 99% blowouts from Elo alone
  });
});
