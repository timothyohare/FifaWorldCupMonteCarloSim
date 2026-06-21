import { describe, it, expect } from "vitest";
import { ClaudeAdapterModel, buildPredictionIndex } from "./claude-adapter";
import { EloPoissonModel } from "./elo-poisson";
import { mulberry32 } from "../domain/rng";

const ratings = new Map([
  ["BRA", 2000],
  ["CMR", 1700],
  ["ARG", 2050],
  ["MEX", 1800],
]);
const fallback = new EloPoissonModel(ratings, { homeAdvantage: 0 });

// One precomputed prediction (BRA strongly favoured); the other pairing has none.
const index = buildPredictionIndex(
  [{ matchId: "m1", homeWinProbability: 0.8, drawProbability: 0.15, awayWinProbability: 0.05, predictedScore: { home: 2, away: 0 } }],
  [
    { id: "m1", home: "BRA", away: "CMR" },
    { id: "m2", home: "ARG", away: "MEX" }, // no prediction -> fallback
  ],
);
const model = new ClaudeAdapterModel(index, fallback);

describe("ClaudeAdapterModel", () => {
  it("indexes only fixtures that have a prediction", () => {
    expect(index.size).toBe(1); // m1 predicted; m2 had none
  });

  it("matchOutcome returns Claude's probabilities for a known pairing", () => {
    const o = model.matchOutcome("BRA", "CMR");
    expect(o.pHome).toBeCloseTo(0.8, 5);
    expect(o.pDraw).toBeCloseTo(0.15, 5);
    expect(o.pAway).toBeCloseTo(0.05, 5);
  });

  it("falls back to the base model for an unknown pairing", () => {
    expect(model.matchOutcome("ARG", "MEX")).toEqual(fallback.matchOutcome("ARG", "MEX"));
  });

  it("winProbability excludes draws and uses Claude for a known pairing", () => {
    expect(model.winProbability("BRA", "CMR")).toBeCloseTo(0.8 / 0.85, 5);
  });

  it("sampleScore is deterministic for a fixed seed", () => {
    expect(model.sampleScore("BRA", "CMR", mulberry32(3))).toEqual(model.sampleScore("BRA", "CMR", mulberry32(3)));
  });

  it("sampled outcomes honour Claude's win probability for a known pairing", () => {
    const rng = mulberry32(7);
    let homeWins = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const s = model.sampleScore("BRA", "CMR", rng);
      if (s.home > s.away) homeWins += 1;
    }
    expect(homeWins / N).toBeCloseTo(0.8, 1); // ~Claude's 80%, not the Elo-implied value
  });

  it("sampleScore for an unknown pairing tracks the fallback model", () => {
    const rng = mulberry32(9);
    let homeWins = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const s = model.sampleScore("ARG", "MEX", rng);
      if (s.home > s.away) homeWins += 1;
    }
    expect(homeWins / N).toBeCloseTo(fallback.matchOutcome("ARG", "MEX").pHome, 1);
  });
});
